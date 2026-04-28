import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createControlPlane } from '../src/index.js';

test('domain emits lease lifecycle events', () => {
  const plane = createControlPlane();
  const result = plane.domain.acquireLease({
    type: 'turtle_control',
    resourceId: 'turtle-001',
    holder: 'operator-a',
    ttlMs: 1000,
    now: 100
  });

  assert.equal(result.ok, true);
  assert.equal(plane.events.byAggregate('lease', 'turtle_control:turtle-001')[0].type, 'event.lease.acquired');
});

test('domain rejects action enqueue without lease', () => {
  const plane = createControlPlane();
  const result = plane.domain.enqueueAction({ turtleId: 'turtle-001', action: 'forward' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_lease');
});

test('domain enqueues action with valid lease and emits command event', () => {
  const plane = createControlPlane();
  const lease = plane.domain.acquireLease({
    type: 'turtle_control',
    resourceId: 'turtle-001',
    holder: 'operator-a',
    ttlMs: 1000,
    now: Date.now()
  }).lease;

  const result = plane.domain.enqueueAction({
    turtleId: 'turtle-001',
    action: 'inspect',
    lease,
    requestedBy: 'operator-a',
    idempotencyKey: 'manual-1'
  });

  assert.equal(result.ok, true);
  assert.equal(plane.events.byAggregate('command', result.command.commandId)[0].type, 'event.command.queued');
});

test('domain rate limits repeated manual action without idempotency key', () => {
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    const plane = createControlPlane();
    const lease = plane.domain.acquireLease({
      type: 'turtle_control',
      resourceId: 'turtle-001',
      holder: 'operator-a',
      ttlMs: 1000,
      now
    }).lease;
    const first = plane.domain.enqueueAction({ turtleId: 'turtle-001', action: 'inspect', lease });
    now = 1001;
    const second = plane.domain.enqueueAction({ turtleId: 'turtle-001', action: 'inspect', lease });

    assert.equal(first.ok, true);
    assert.equal(second.reason, 'rate_limited');
  } finally {
    Date.now = originalNow;
  }
});

test('domain creates and assigns jobs through scheduler', () => {
  const plane = createControlPlane();
  const job = plane.domain.createJob({ goalText: 'Survey nearby blocks', createdBy: 'operator-a' });
  const assigned = plane.domain.assignJob({
    jobId: job.jobId,
    turtles: [{ turtleId: 'turtle-001', status: 'online', fuel: 100, capabilities: [] }]
  });

  assert.equal(assigned.ok, true);
  assert.equal(plane.readModels().fleet.job(job.jobId).status, 'running');
});

test('domain clears turtle queue and emits event', () => {
  const plane = createControlPlane();
  plane.commands.enqueue({ turtleId: 'turtle-001', kind: 'turtle.action' });
  plane.commands.enqueue({ turtleId: 'turtle-001', kind: 'turtle.action' });

  const result = plane.domain.clearTurtleQueue('turtle-001');

  assert.equal(result.cleared, 2);
  assert.equal(plane.events.byAggregate('turtle', 'turtle-001').at(-1).type, 'event.command_queue.cleared');
});

test('domain quarantines turtle after repeated command failures', () => {
  const plane = createControlPlane();
  const commands = [
    plane.commands.enqueue({ turtleId: 'turtle-001', kind: 'turtle.action' }),
    plane.commands.enqueue({ turtleId: 'turtle-001', kind: 'turtle.action' }),
    plane.commands.enqueue({ turtleId: 'turtle-001', kind: 'turtle.action' })
  ];

  for (const command of commands) {
    plane.domain.completeCommand(command.commandId, { success: false });
  }

  assert.equal(plane.readModels().fleet.turtle('turtle-001').status, 'quarantined');
});
