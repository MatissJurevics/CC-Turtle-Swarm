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

