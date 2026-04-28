import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createControlPlane } from '../src/index.js';
import { handleApiRequest, handleHttpRequest } from '../src/http-server.js';
import { WebSocketGateway } from '../src/websocket-gateway.js';
import { hashBundle } from '../src/scripts.js';

async function callApi(plane, { method = 'GET', url, body }) {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = url;
  req.headers = {};

  const res = {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk) {
      this.body += chunk ?? '';
    }
  };

  await handleApiRequest(req, res, plane);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

async function callHttp(plane, { method = 'GET', url, body }) {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  req.method = method;
  req.url = url;
  req.headers = {};

  const res = {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk) {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk ?? '';
    }
  };

  await handleHttpRequest(req, res, plane);
  return res;
}

function encodeClientFrame(payload) {
  const body = Buffer.from(JSON.stringify(payload));
  const mask = Buffer.from([1, 2, 3, 4]);
  const header = [0x81];
  if (body.length < 126) {
    header.push(0x80 | body.length, ...mask);
  } else {
    header.push(0x80 | 126, (body.length >> 8) & 0xff, body.length & 0xff, ...mask);
  }
  const masked = Buffer.from(body);
  for (let index = 0; index < masked.length; index += 1) {
    masked[index] ^= mask[index % 4];
  }
  return Buffer.concat([Buffer.from(header), masked]);
}

function decodeServerFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    let length = buffer[offset + 1] & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    }
    const body = buffer.subarray(cursor, cursor + length).toString('utf8');
    frames.push(JSON.parse(body));
    offset = cursor + length;
  }
  return frames;
}

class FakeSocket extends EventEmitter {
  writes = [];
  destroyed = false;

  write(chunk) {
    this.writes.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  destroy() {
    this.destroyed = true;
    this.emit('close');
  }

  end() {
    this.emit('close');
  }
}

function websocketRequest(url) {
  return {
    url,
    headers: {
      'sec-websocket-key': createHash('sha1').update(url).digest('base64').slice(0, 24)
    }
  };
}

test('HTTP API exposes health and fleet state', async () => {
  const plane = createControlPlane();
  plane.recordHeartbeat('turtle-001', { fuel: 50, runtime_version: '0.1.0' });

  const health = await callApi(plane, { url: '/health' });
  const fleet = await callApi(plane, { url: '/api/fleet' });

  assert.equal(health.body.ok, true);
  assert.equal(fleet.body.turtles[0].turtleId, 'turtle-001');
  assert.equal(fleet.body.turtles[0].fuel, 50);
});

test('HTTP API acquires lease and enqueues turtle action', async () => {
  const plane = createControlPlane();
  const lease = await callApi(plane, {
    method: 'POST',
    url: '/api/leases',
    body: {
      type: 'turtle_control',
      resourceId: 'turtle-001',
      holder: 'operator-a',
      ttlMs: 1000
    }
  });
  const action = await callApi(plane, {
    method: 'POST',
    url: '/api/turtles/turtle-001/actions',
    body: {
      action: 'inspect',
      lease: lease.body.lease,
      requestedBy: 'operator-a',
      idempotencyKey: 'manual-1'
    }
  });

  assert.equal(lease.status, 201);
  assert.equal(action.status, 202);
  assert.equal(action.body.ok, true);
  assert.equal(action.body.command.kind, 'turtle.action');
});

test('HTTP API clears queued turtle commands', async () => {
  const plane = createControlPlane();
  plane.commands.enqueue({ turtleId: 'turtle-001', kind: 'turtle.action' });
  plane.commands.enqueue({ turtleId: 'turtle-001', kind: 'turtle.action' });

  const cleared = await callApi(plane, {
    method: 'POST',
    url: '/api/turtles/turtle-001/queue-clear',
    body: { reason: 'test' }
  });

  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.cleared, 2);
});

test('HTTP API creates and cancels jobs', async () => {
  const plane = createControlPlane();
  const created = await callApi(plane, {
    method: 'POST',
    url: '/api/jobs',
    body: { goalText: 'Survey nearby blocks', createdBy: 'operator-a' }
  });
  const cancelled = await callApi(plane, {
    method: 'POST',
    url: `/api/jobs/${created.body.job.jobId}/cancel`,
    body: { reason: 'test' }
  });
  const jobs = await callApi(plane, { url: '/api/jobs' });

  assert.equal(created.body.ok, true);
  assert.equal(cancelled.body.ok, true);
  assert.equal(jobs.body.jobs[0].status, 'cancelled');
});

test('HTTP API queries world and deploys scripts', async () => {
  const plane = createControlPlane();
  const world = await callApi(plane, { url: '/api/world?minX=0&maxX=1&minY=64&maxY=64&minZ=0&maxZ=0' });
  const files = { 'main.lua': 'return function(rt) rt.inspect() end' };
  const script = await callApi(plane, {
    method: 'POST',
    url: '/api/scripts',
    body: {
      manifest: {
        name: 'inspect_once',
        version: '1.0.0',
        entrypoint: 'main.lua',
        permissions: ['turtle.inspect'],
        limits: { max_runtime_s: 30 },
        sha256: hashBundle(files)
      },
      files
    }
  });

  assert.equal(world.body.cells.length, 2);
  assert.equal(world.body.cells[0].occupancy, 'unknown');
  assert.equal(script.status, 201);
  assert.equal(script.body.ok, true);
});

test('WebSocket gateway accepts heartbeats and dispatches queued commands without binding a port', () => {
  const plane = createControlPlane();
  const gateway = new WebSocketGateway({ plane, pairingToken: 'dev-pairing-token' });
  plane.commands.enqueue({ turtleId: 'turtle-001', kind: 'turtle.action', body: { action: 'inspect' } });

  const socket = new FakeSocket();
  gateway.handleUpgrade(
    websocketRequest('/turtle/ws?turtle_id=turtle-001&token=dev-pairing-token'),
    socket
  );
  socket.emit('data', encodeClientFrame({ type: 'event.turtle.heartbeat', body: { fuel: 99 } }));
  socket.emit('data', encodeClientFrame({ type: 'command.next' }));

  const frameBytes = Buffer.concat(socket.writes.slice(1));
  const messages = decodeServerFrames(frameBytes);

  assert.match(socket.writes[0].toString('utf8'), /101 Switching Protocols/);
  assert.equal(messages[0].type, 'event.gateway.ready');
  assert.equal(messages[1].type, 'ack');
  assert.equal(messages[2].type, 'command.request');
  assert.equal(messages[2].body.body.action, 'inspect');
  assert.equal(plane.readModels().fleet.turtle('turtle-001').fuel, 99);
});

test('WebSocket gateway completes commands from replayed turtle spool', () => {
  const plane = createControlPlane();
  const gateway = new WebSocketGateway({ plane, pairingToken: 'dev-pairing-token' });
  const command = plane.commands.enqueue({ turtleId: 'turtle-001', kind: 'turtle.action', body: { action: 'inspect' } });

  const socket = new FakeSocket();
  gateway.handleUpgrade(
    websocketRequest('/turtle/ws?turtle_id=turtle-001&token=dev-pairing-token'),
    socket
  );
  socket.emit('data', encodeClientFrame({
    type: 'event.spool',
    events: [
      {
        event_id: 'evt-001',
        type: 'event.action.completed',
        aggregate_type: 'command',
        aggregate_id: command.commandId,
        body: { command_id: command.commandId, success: true }
      }
    ]
  }));

  assert.equal(plane.commands.all()[0].status, 'succeeded');
});

test('HTTP server serves operator console static assets', async () => {
  const plane = createControlPlane();
  const index = await callHttp(plane, { url: '/' });
  const styles = await callHttp(plane, { url: '/styles.css' });
  const app = await callHttp(plane, { url: '/app.js' });

  assert.equal(index.statusCode, 200);
  assert.match(index.body, /Operator Console/);
  assert.equal(styles.statusCode, 200);
  assert.match(styles.body, /fleet-pane/);
  assert.equal(app.statusCode, 200);
  assert.match(app.body, /\/api\/fleet/);
});
