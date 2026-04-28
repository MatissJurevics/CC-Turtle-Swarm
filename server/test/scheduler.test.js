import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scheduler } from '../src/scheduler.js';

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

