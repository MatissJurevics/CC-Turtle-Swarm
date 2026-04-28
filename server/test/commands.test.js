import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CommandQueue } from '../src/commands.js';

test('enqueues and dispatches command for turtle', () => {
  const queue = new CommandQueue();
  const command = queue.enqueue({
    turtleId: 'turtle-001',
    kind: 'turtle.action',
    body: { action: 'inspect' }
  });

  const next = queue.nextForTurtle('turtle-001');
  assert.equal(next.commandId, command.commandId);
  assert.equal(next.status, 'sent');
});

test('deduplicates idempotency key', () => {
  const queue = new CommandQueue();
  const first = queue.enqueue({
    turtleId: 'turtle-001',
    kind: 'turtle.action',
    idempotencyKey: 'manual-1'
  });
  const second = queue.enqueue({
    turtleId: 'turtle-001',
    kind: 'turtle.action',
    idempotencyKey: 'manual-1'
  });

  assert.equal(second.commandId, first.commandId);
  assert.equal(queue.all().length, 1);
});

test('does not dispatch expired commands', () => {
  const queue = new CommandQueue();
  queue.enqueue({
    turtleId: 'turtle-001',
    kind: 'turtle.action',
    createdAt: new Date(100).toISOString(),
    body: { ttlMs: 50 }
  });

  assert.equal(queue.nextForTurtle('turtle-001', 200), null);
});

test('completes commands with success and failure status', () => {
  const queue = new CommandQueue();
  const command = queue.enqueue({
    turtleId: 'turtle-001',
    kind: 'turtle.action'
  });

  const completed = queue.complete(command.commandId, { success: true });
  assert.equal(completed.status, 'succeeded');
});

test('cancels queued command only before dispatch', () => {
  const queue = new CommandQueue();
  const command = queue.enqueue({
    turtleId: 'turtle-001',
    kind: 'turtle.action'
  });

  assert.equal(queue.cancel(command.commandId), true);
  assert.equal(queue.nextForTurtle('turtle-001'), null);
});

