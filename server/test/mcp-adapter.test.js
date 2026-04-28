import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createControlPlane } from '../src/index.js';
import { hashBundle } from '../src/scripts.js';

test('MCP adapter lists resources and read tools', () => {
  const plane = createControlPlane();
  plane.recordHeartbeat('turtle-001', { fuel: 10 });

  const resources = plane.mcp.listResources();
  const tools = plane.mcp.listTools();

  assert.equal(resources.includes('fleet://overview'), true);
  assert.equal(resources.includes('turtle://turtle-001/state'), true);
  assert.equal(tools.some((tool) => tool.name === 'fleet.list_turtles' && tool.mutates === false), true);
});

test('MCP resource reads do not mutate state', () => {
  const plane = createControlPlane();
  plane.recordHeartbeat('turtle-001', { fuel: 10 });
  const before = plane.events.all().length;

  const state = plane.mcp.readResource('turtle://turtle-001/state');

  assert.equal(state.fuel, 10);
  assert.equal(plane.events.all().length, before);
});

test('MCP mutating tools require confirmation and audit attempts', () => {
  const plane = createControlPlane();
  const result = plane.mcp.callTool('jobs.create', { goalText: 'Survey nearby blocks' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'confirmation_required');
  assert.equal(plane.events.all().some((event) => event.type === 'event.audit.mcp_tool_call'), true);
});

test('MCP can plan and create jobs through safe adapter', () => {
  const plane = createControlPlane();
  const plan = plane.mcp.callTool('jobs.plan', { goalText: 'Mine a quarry' });
  const created = plane.mcp.callTool(
    'jobs.create',
    { goalText: 'Survey nearby blocks', createdBy: 'operator-a' },
    { confirmed: true, requestedBy: 'operator-a' }
  );

  assert.equal(plan.ok, true);
  assert.equal(plan.plan.steps.some((step) => step.kind === 'assign_dig_lanes'), true);
  assert.equal(created.ok, true);
  assert.equal(plane.readModels().fleet.job(created.job.jobId).status, 'planned');
});

test('MCP turtle action requires valid lease', () => {
  const plane = createControlPlane();
  const missingLease = plane.mcp.callTool(
    'turtle.action',
    { turtleId: 'turtle-001', action: 'inspect' },
    { confirmed: true }
  );
  const lease = plane.mcp.callTool(
    'leases.acquire',
    { type: 'turtle_control', resourceId: 'turtle-001', holder: 'operator-a', ttlMs: 1000 },
    { confirmed: true }
  );
  const action = plane.mcp.callTool(
    'turtle.action',
    {
      turtleId: 'turtle-001',
      action: 'inspect',
      lease: lease.lease,
      requestedBy: 'operator-a',
      idempotencyKey: 'mcp-action-1'
    },
    { confirmed: true }
  );

  assert.equal(missingLease.reason, 'missing_lease');
  assert.equal(action.ok, true);
});

test('MCP validates, deploys, and guards script runs', () => {
  const plane = createControlPlane();
  const files = { 'main.lua': 'return function(rt) rt.inspect() end' };
  const scriptPackage = {
    manifest: {
      name: 'inspect_once',
      version: '1.0.0',
      entrypoint: 'main.lua',
      permissions: ['turtle.inspect'],
      limits: { max_runtime_s: 30 },
      sha256: hashBundle(files)
    },
    files
  };
  const validation = plane.mcp.callTool('scripts.validate', scriptPackage);
  const deployed = plane.mcp.callTool('scripts.deploy', scriptPackage, { confirmed: true });
  const run = plane.mcp.callTool(
    'scripts.run',
    { scriptId: deployed.script.scriptId, turtleId: 'turtle-001', permissions: ['turtle.inspect'] },
    { confirmed: true }
  );

  assert.equal(validation.ok, true);
  assert.equal(deployed.ok, true);
  assert.equal(run.reason, 'script_not_approved');
});

test('MCP diagnostics explains recent failure', () => {
  const plane = createControlPlane();
  plane.events.append({
    type: 'event.action.completed',
    aggregateType: 'command',
    aggregateId: 'cmd-001',
    turtleId: 'turtle-001',
    payload: { success: false, error: { code: 'blocked' } }
  });

  const result = plane.mcp.callTool('diagnostics.explain_failure');
  assert.equal(result.ok, true);
  assert.equal(result.likelyCause, 'movement_obstructed');
});

