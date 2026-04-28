import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scheduler } from '../src/scheduler.js';
import { WorldModel } from '../src/projections.js';

test('plans mining and survey goals into job steps', () => {
  const scheduler = new Scheduler();
  const mining = scheduler.plan('Mine a 16x16 quarry');
  const survey = scheduler.plan('Survey the wall');

  assert.equal(mining.steps.some((step) => step.kind === 'assign_dig_lanes'), true);
  assert.equal(survey.steps.some((step) => step.kind === 'scan_cells'), true);
});

test('selects online turtles by fuel and capability', () => {
  const scheduler = new Scheduler();
  const selected = scheduler.selectTurtles({
    requirements: { minFuel: 50, capabilities: ['mining'] },
    turtles: [
      { turtleId: 'offline', status: 'offline', fuel: 100, capabilities: ['mining'] },
      { turtleId: 'low-fuel', status: 'online', fuel: 10, capabilities: ['mining'] },
      { turtleId: 'ready', status: 'online', fuel: 80, capabilities: ['mining'] }
    ]
  });

  assert.deepEqual(selected.map((turtle) => turtle.turtleId), ['ready']);
});

test('returns actionable blocked reasons', () => {
  const scheduler = new Scheduler();

  assert.equal(scheduler.blockedReason({ turtles: [], requirements: {} }), 'no_online_turtles');
  assert.equal(
    scheduler.blockedReason({ turtles: [{ status: 'online', fuel: 1 }], requirements: { minFuel: 10 } }),
    'insufficient_fuel'
  );
});

test('reserves cells through world model and reports conflicts', () => {
  const scheduler = new Scheduler();
  const world = new WorldModel();
  const first = scheduler.reserveCells({
    world,
    jobId: 'job-001',
    cells: [{ x: 0, y: 64, z: 0 }],
    now: '2026-04-28T12:00:00.000Z'
  });
  const second = scheduler.reserveCells({
    world,
    jobId: 'job-002',
    cells: [{ x: 0, y: 64, z: 0 }],
    now: '2026-04-28T12:00:01.000Z'
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'reservation_conflict');
});

test('builds saga-style recovery actions by failure type', () => {
  const scheduler = new Scheduler();
  const blocked = scheduler.recoveryPlan({ jobId: 'job-001', failureCode: 'blocked' });
  const fuel = scheduler.recoveryPlan({ jobId: 'job-001', failureCode: 'low_fuel' });

  assert.equal(blocked.some((step) => step.kind === 'replan_path'), true);
  assert.equal(fuel.some((step) => step.kind === 'route_to_refuel'), true);
});
