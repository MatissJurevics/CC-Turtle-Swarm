import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createControlPlane } from './index.js';
import { notFound, parseUrl, readJson, sendJson } from './http-utils.js';
import { WebSocketGateway } from './websocket-gateway.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const staticFiles = new Map([
  ['/', { path: 'web/index.html', contentType: 'text/html; charset=utf-8' }],
  ['/index.html', { path: 'web/index.html', contentType: 'text/html; charset=utf-8' }],
  ['/console', { path: 'web/console.html', contentType: 'text/html; charset=utf-8' }],
  ['/console/', { path: 'web/console.html', contentType: 'text/html; charset=utf-8' }],
  ['/console.html', { path: 'web/console.html', contentType: 'text/html; charset=utf-8' }],
  ['/landing.js', { path: 'web/landing.js', contentType: 'text/javascript; charset=utf-8' }],
  ['/console.js', { path: 'web/console.js', contentType: 'text/javascript; charset=utf-8' }],
  ['/setup-command.js', { path: 'web/setup-command.js', contentType: 'text/javascript; charset=utf-8' }],
  ['/map-view.js', { path: 'web/map-view.js', contentType: 'text/javascript; charset=utf-8' }],
  ['/styles.css', { path: 'web/styles.css', contentType: 'text/css; charset=utf-8' }],
  ['/turtle/install.lua', { path: 'turtle/install.lua', contentType: 'text/plain; charset=utf-8' }],
  ['/turtle/files/startup.lua', { path: 'turtle/startup.lua', contentType: 'text/plain; charset=utf-8' }],
  ['/turtle/files/runtime/config.lua', { path: 'turtle/runtime/config.lua', contentType: 'text/plain; charset=utf-8' }],
  ['/turtle/files/runtime/logger.lua', { path: 'turtle/runtime/logger.lua', contentType: 'text/plain; charset=utf-8' }],
  ['/turtle/files/runtime/spool.lua', { path: 'turtle/runtime/spool.lua', contentType: 'text/plain; charset=utf-8' }],
  ['/turtle/files/runtime/actuator.lua', { path: 'turtle/runtime/actuator.lua', contentType: 'text/plain; charset=utf-8' }],
  ['/turtle/files/runtime/transport.lua', { path: 'turtle/runtime/transport.lua', contentType: 'text/plain; charset=utf-8' }],
  ['/turtle/files/runtime/watchdog.lua', { path: 'turtle/runtime/watchdog.lua', contentType: 'text/plain; charset=utf-8' }],
  ['/turtle/files/runtime/executor.lua', { path: 'turtle/runtime/executor.lua', contentType: 'text/plain; charset=utf-8' }],
  ['/turtle/files/runtime/odometry.lua', { path: 'turtle/runtime/odometry.lua', contentType: 'text/plain; charset=utf-8' }],
  ['/turtle/files/runtime/scanner.lua', { path: 'turtle/runtime/scanner.lua', contentType: 'text/plain; charset=utf-8' }],
  ['/turtle/files/runtime/main.lua', { path: 'turtle/runtime/main.lua', contentType: 'text/plain; charset=utf-8' }]
]);

function audit(plane, req, statusCode, payload = {}) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return;
  }
  plane.events.append({
    type: 'event.audit.api_call',
    aggregateType: 'api',
    aggregateId: randomUUID(),
    payload: {
      method: req.method,
      url: req.url,
      statusCode,
      payload
    }
  });
}

export async function handleApiRequest(req, res, plane, setup = {}) {
  const url = parseUrl(req);
  const models = () => plane.readModels();

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, service: 'computercraft-turtle-fleet' });
  }

  if (req.method === 'GET' && url.pathname === '/api/setup') {
    return sendJson(res, 200, {
      pairingToken: setup.pairingToken ?? 'dev-pairing-token',
      installPath: '/turtle/install.lua',
      runtimeVersion: '0.1.0',
      suggestedTurtleId: 'fleet-dev-001'
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/fleet') {
    const read = models();
    return sendJson(res, 200, {
      turtles: read.fleet.turtles(),
      jobs: read.fleet.jobs(),
      diagnostics: read.diagnostics.recent({ limit: 10 }),
      commands: plane.commands.all()
    });
  }

  const turtleMatch = url.pathname.match(/^\/api\/turtles\/([^/]+)(?:\/([^/]+))?$/);
  if (req.method === 'GET' && turtleMatch) {
    const turtle = models().fleet.turtle(turtleMatch[1]);
    if (!turtle) {
      return notFound(res);
    }
    if (turtleMatch[2] === 'inventory') {
      return sendJson(res, 200, { turtleId: turtle.turtleId, inventory: turtle.inventory });
    }
    if (turtleMatch[2] === 'logs') {
      const limit = Number(url.searchParams.get('limit') ?? 100);
      const events = plane.events.byTurtle(turtle.turtleId);
      return sendJson(res, 200, {
        turtleId: turtle.turtleId,
        events: Number.isFinite(limit) && limit > 0 ? events.slice(-limit) : events
      });
    }
    return sendJson(res, 200, turtle);
  }

  if (req.method === 'POST' && turtleMatch && turtleMatch[2] === 'actions') {
    const body = await readJson(req);
    const result = plane.domain.enqueueAction({
      turtleId: turtleMatch[1],
      action: body.action,
      args: body.args ?? [],
      lease: body.lease,
      idempotencyKey: body.idempotencyKey,
      requestedBy: body.requestedBy ?? 'api',
      ttlMs: body.ttlMs ?? 5000
    });
    audit(plane, req, result.ok ? 202 : 400, result);
    return sendJson(res, result.ok ? 202 : 400, result);
  }

  if (req.method === 'POST' && turtleMatch && turtleMatch[2] === 'queue-clear') {
    const body = await readJson(req);
    const result = plane.domain.clearTurtleQueue(turtleMatch[1], body.reason ?? 'api_clear');
    audit(plane, req, 200, result);
    return sendJson(res, 200, result);
  }

  if (req.method === 'GET' && url.pathname === '/api/jobs') {
    return sendJson(res, 200, { jobs: models().fleet.jobs() });
  }

  if (req.method === 'POST' && url.pathname === '/api/jobs') {
    const body = await readJson(req);
    const job = plane.domain.createJob(body);
    audit(plane, req, 201, { jobId: job.jobId });
    return sendJson(res, 201, { ok: true, job });
  }

  const cancelMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/cancel$/);
  if (req.method === 'POST' && cancelMatch) {
    const body = await readJson(req);
    const result = plane.domain.cancelJob(cancelMatch[1], body.reason ?? 'api_cancelled');
    audit(plane, req, 200, result);
    return sendJson(res, 200, result);
  }

  if (req.method === 'POST' && url.pathname === '/api/leases') {
    const body = await readJson(req);
    const result = plane.domain.acquireLease(body);
    audit(plane, req, result.ok ? 201 : 409, result);
    return sendJson(res, result.ok ? 201 : 409, result);
  }

  if (req.method === 'GET' && url.pathname === '/api/world') {
    const query = Object.fromEntries(url.searchParams);
    const cells = models().world.query({
      dimension: query.dimension ?? 'overworld',
      minX: Number(query.minX ?? 0),
      maxX: Number(query.maxX ?? query.minX ?? 0),
      minY: Number(query.minY ?? 0),
      maxY: Number(query.maxY ?? query.minY ?? 0),
      minZ: Number(query.minZ ?? 0),
      maxZ: Number(query.maxZ ?? query.minZ ?? 0)
    });
    return sendJson(res, 200, { cells });
  }

  if (req.method === 'GET' && url.pathname === '/api/errors/recent') {
    return sendJson(res, 200, { errors: models().diagnostics.recent({ limit: Number(url.searchParams.get('limit') ?? 20) }) });
  }

  if (req.method === 'GET' && url.pathname === '/api/scripts') {
    return sendJson(res, 200, { scripts: plane.scripts.list() });
  }

  if (req.method === 'POST' && url.pathname === '/api/scripts') {
    const body = await readJson(req);
    const result = plane.scripts.deploy(body);
    audit(plane, req, result.ok ? 201 : 400, result);
    return sendJson(res, result.ok ? 201 : 400, result);
  }

  return notFound(res);
}

export async function handleHttpRequest(req, res, plane, setup = {}) {
  const url = parseUrl(req);
  const staticFile = req.method === 'GET' ? staticFiles.get(url.pathname) : null;
  if (staticFile) {
    const body = await readFile(path.join(rootDir, staticFile.path));
    res.writeHead(200, {
      'content-type': staticFile.contentType,
      'content-length': body.length
    });
    res.end(body);
    return;
  }
  return handleApiRequest(req, res, plane, setup);
}

export function createHttpServer({ plane = createControlPlane(), pairingToken = 'dev-pairing-token' } = {}) {
  const setup = { pairingToken };
  const gateway = new WebSocketGateway({ plane, pairingToken });
  const server = http.createServer(async (req, res) => {
    try {
      await handleHttpRequest(req, res, plane, setup);
    } catch (error) {
      sendJson(res, 500, { ok: false, reason: 'internal_error', message: error.message });
    }
  });
  server.on('upgrade', (req, socket) => gateway.handleUpgrade(req, socket));
  return { server, plane, gateway };
}
