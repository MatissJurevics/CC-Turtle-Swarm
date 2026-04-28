import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createControlPlane } from '../src/index.js';

test('records heartbeat through event store', () => {
  const plane = createControlPlane();
  const event = plane.recordHeartbeat('turtle-001', { fuel: 100 });

  assert.equal(event.type, 'event.turtle.heartbeat');
  assert.equal(event.turtleId, 'turtle-001');
  assert.equal(plane.events.byTurtle('turtle-001').length, 1);
});

