import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventStore } from '../src/event-store.js';

test('appends events with aggregate sequence numbers', () => {
  const store = new EventStore();

  const first = store.append({
    type: 'event.turtle.booted',
    aggregateType: 'turtle',
    aggregateId: 'turtle-001',
    turtleId: 'turtle-001'
  });
  const second = store.append({
    type: 'event.turtle.heartbeat',
    aggregateType: 'turtle',
    aggregateId: 'turtle-001',
    turtleId: 'turtle-001'
  });

  assert.equal(first.seq, 1);
  assert.equal(second.seq, 2);
  assert.equal(store.byAggregate('turtle', 'turtle-001').length, 2);
});

test('queries events by turtle and job', () => {
  const store = new EventStore();

  store.append({
    type: 'event.action.completed',
    aggregateType: 'command',
    aggregateId: 'cmd-001',
    turtleId: 'turtle-001',
    jobId: 'job-001'
  });
  store.append({
    type: 'event.action.completed',
    aggregateType: 'command',
    aggregateId: 'cmd-002',
    turtleId: 'turtle-002',
    jobId: 'job-001'
  });

  assert.equal(store.byTurtle('turtle-001').length, 1);
  assert.equal(store.byJob('job-001').length, 2);
});

test('rejects malformed events', () => {
  const store = new EventStore();

  assert.throws(() => store.append({ aggregateType: 'turtle', aggregateId: 'turtle-001' }), /event.type/);
  assert.throws(() => store.append({ type: 'event.turtle.booted' }), /aggregate/);
});

