import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventStore } from '../src/event-store.js';
import {
  DiagnosticsProjection,
  FleetProjection,
  WorldModel,
  buildReadModels,
  observedCellFromDirection,
  turnFacing
} from '../src/projections.js';

test('fleet projection materializes turtle heartbeat and action failure', () => {
  const store = new EventStore();
  store.append({
    type: 'event.turtle.heartbeat',
    aggregateType: 'turtle',
    aggregateId: 'turtle-001',
    turtleId: 'turtle-001',
    createdAt: '2026-04-28T12:00:00.000Z',
    payload: {
      fuel: 100,
      selected_slot: 2,
      runtime_version: '0.1.0',
      inventory: { 1: { name: 'minecraft:coal', count: 4 } }
    }
  });
  store.append({
    type: 'event.action.completed',
    aggregateType: 'command',
    aggregateId: 'cmd-001',
    turtleId: 'turtle-001',
    payload: {
      success: false,
      error: { code: 'blocked', message: 'Movement obstructed' },
      after: { fuel: 100, selected_slot: 2 }
    }
  });

  const projection = new FleetProjection().replay(store.all());
  const turtle = projection.turtle('turtle-001');

  assert.equal(turtle.status, 'online');
  assert.equal(turtle.fuel, 100);
  assert.equal(turtle.selectedSlot, 2);
  assert.equal(turtle.runtimeVersion, '0.1.0');
  assert.equal(turtle.lastError.code, 'blocked');
});

test('fleet projection materializes job lifecycle', () => {
  const store = new EventStore();
  store.append({
    type: 'event.job.created',
    aggregateType: 'job',
    aggregateId: 'job-001',
    jobId: 'job-001',
    payload: { goalText: 'inspect area', priority: 5 }
  });
  store.append({
    type: 'event.job.assigned',
    aggregateType: 'job',
    aggregateId: 'job-001',
    jobId: 'job-001',
    payload: { turtleIds: ['turtle-001'] }
  });

  const job = new FleetProjection().replay(store.all()).job('job-001');
  assert.equal(job.status, 'running');
  assert.deepEqual(job.assignedTurtles, ['turtle-001']);
});

test('world model returns unknown cells before observation', () => {
  const world = new WorldModel();
  const cell = world.getCell({ x: 1, y: 2, z: 3 });

  assert.equal(cell.occupancy, 'unknown');
  assert.equal(cell.confidence, 0);
});

test('world model projects action observations into cells', () => {
  const store = new EventStore();
  store.append({
    type: 'event.action.completed',
    aggregateType: 'command',
    aggregateId: 'cmd-001',
    turtleId: 'turtle-001',
    createdAt: '2026-04-28T12:00:00.000Z',
    payload: {
      success: true,
      before: { position: [10, 64, 10], facing: 'north', dimension: 'overworld' },
      observations: [
        {
          direction: 'front',
          block: { name: 'minecraft:stone', state: {} }
        }
      ]
    }
  });

  const world = new WorldModel().replay(store.all());
  const cell = world.getCell({ x: 10, y: 64, z: 9 });

  assert.equal(cell.occupancy, 'solid');
  assert.equal(cell.blockName, 'minecraft:stone');
  assert.equal(cell.lastSeenBy, 'turtle-001');
});

test('world model projects turtle scan observations into surrounding cells', () => {
  const store = new EventStore();
  store.append({
    type: 'event.world.scanned',
    aggregateType: 'turtle',
    aggregateId: 'turtle-001',
    turtleId: 'turtle-001',
    createdAt: '2026-04-28T12:01:00.000Z',
    payload: {
      origin: { position: [10, 64, 10], facing: 'north', dimension: 'overworld' },
      after: { position: [10, 64, 10], facing: 'north', dimension: 'overworld' },
      observations: [
        {
          direction: 'north',
          cell: { dimension: 'overworld', x: 10, y: 64, z: 9 },
          block: { name: 'minecraft:stone', state: {} }
        },
        {
          direction: 'up',
          cell: { dimension: 'overworld', x: 10, y: 65, z: 10 },
          occupancy: 'air',
          block: { name: 'minecraft:air', state: {} }
        }
      ]
    }
  });

  const models = buildReadModels(store);
  const north = models.world.getCell({ x: 10, y: 64, z: 9 });
  const up = models.world.getCell({ x: 10, y: 65, z: 10 });
  const turtle = models.fleet.turtle('turtle-001');

  assert.equal(north.occupancy, 'solid');
  assert.equal(up.occupancy, 'air');
  assert.equal(turtle.lastScanCount, 2);
  assert.equal(turtle.lastScanAt, '2026-04-28T12:01:00.000Z');
});

test('world model supports reservations and detects conflicts', () => {
  const world = new WorldModel();
  const first = world.reserve(
    { x: 1, y: 2, z: 3 },
    { reservedByJobId: 'job-001', reservedUntil: '2026-04-28T12:05:00.000Z' },
    '2026-04-28T12:00:00.000Z'
  );
  const second = world.reserve(
    { x: 1, y: 2, z: 3 },
    { reservedByJobId: 'job-002', reservedUntil: '2026-04-28T12:05:00.000Z' },
    '2026-04-28T12:01:00.000Z'
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'reservation_conflict');
});

test('world model queries bounding boxes including unknown cells', () => {
  const world = new WorldModel();
  const cells = world.query({ minX: 0, maxX: 1, minY: 64, maxY: 64, minZ: 0, maxZ: 1 });

  assert.equal(cells.length, 4);
  assert.equal(cells.every((cell) => cell.occupancy === 'unknown'), true);
});

test('diagnostics projection extracts recent errors', () => {
  const store = new EventStore();
  store.append({
    type: 'event.action.completed',
    aggregateType: 'command',
    aggregateId: 'cmd-001',
    turtleId: 'turtle-001',
    payload: { success: false, error: { code: 'blocked' } }
  });

  const diagnostics = new DiagnosticsProjection().replay(store.all());
  assert.equal(diagnostics.recent().length, 1);
  assert.equal(diagnostics.recent()[0].error.code, 'blocked');
});

test('buildReadModels builds fleet, world, and diagnostics together', () => {
  const store = new EventStore();
  store.append({
    type: 'event.turtle.heartbeat',
    aggregateType: 'turtle',
    aggregateId: 'turtle-001',
    turtleId: 'turtle-001',
    payload: { fuel: 42 }
  });

  const models = buildReadModels(store);
  assert.equal(models.fleet.turtle('turtle-001').fuel, 42);
  assert.equal(models.world.getCell({ x: 0, y: 0, z: 0 }).occupancy, 'unknown');
  assert.deepEqual(models.diagnostics.recent(), []);
});

test('direction helpers track facing and adjacent cells', () => {
  assert.equal(turnFacing('north', 'right'), 'east');
  assert.deepEqual(
    observedCellFromDirection({ position: [0, 64, 0], facing: 'east' }, 'front'),
    { dimension: 'overworld', x: 1, y: 64, z: 0 }
  );
});
