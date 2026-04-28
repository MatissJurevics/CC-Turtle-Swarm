import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventStore } from '../src/event-store.js';
import { LeaseManager } from '../src/leases.js';
import { FactoryService, createAdminProvider, createSurvivalProvider } from '../src/factory.js';

test('factory is disabled by default', () => {
  const factory = new FactoryService();
  const result = factory.createTurtle({ role: 'miner', bayId: 'bay-1', requestedBy: 'operator-a' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'factory_disabled');
});

test('enabled factory reserves a provisioning bay and emits event', () => {
  const events = new EventStore();
  const leases = new LeaseManager();
  const factory = new FactoryService({
    enabled: true,
    leases,
    events,
    providers: {
      survival: createSurvivalProvider({ inventory: { 'computercraft:turtle_normal': 1, 'minecraft:coal': 1 } })
    }
  });

  const result = factory.createTurtle({
    role: 'miner',
    scriptId: 'script-001',
    bayId: 'bay-1',
    requestedBy: 'operator-a',
    now: 100
  });

  assert.equal(result.ok, true);
  assert.equal(result.job.status, 'planned');
  assert.equal(events.byJob(result.job.jobId).length, 1);
});

test('factory prevents bay conflicts', () => {
  const events = new EventStore();
  const leases = new LeaseManager();
  const factory = new FactoryService({
    enabled: true,
    leases,
    events,
    providers: {
      survival: createSurvivalProvider({ inventory: { 'computercraft:turtle_normal': 2, 'minecraft:coal': 2 } })
    }
  });

  factory.createTurtle({ role: 'miner', bayId: 'bay-1', requestedBy: 'operator-a', now: 100 });
  const conflict = factory.createTurtle({ role: 'miner', bayId: 'bay-1', requestedBy: 'operator-b', now: 200 });

  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, 'lease_conflict');
});

test('survival provider checks materials before provisioning', () => {
  const events = new EventStore();
  const leases = new LeaseManager();
  const factory = new FactoryService({ enabled: true, leases, events });

  const result = factory.createTurtle({ role: 'miner', bayId: 'bay-1', requestedBy: 'operator-a' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_turtle_item');
});

test('admin provider is privileged and disabled unless explicitly enabled', () => {
  const events = new EventStore();
  const leases = new LeaseManager();
  const disabled = new FactoryService({ enabled: true, leases, events });
  const enabled = new FactoryService({
    enabled: true,
    leases: new LeaseManager(),
    events: new EventStore(),
    providers: { admin: createAdminProvider({ enabled: true, allowedRequesters: ['admin'] }) }
  });

  assert.equal(
    disabled.createTurtle({ role: 'miner', bayId: 'bay-1', requestedBy: 'admin', mode: 'admin' }).reason,
    'admin_provider_disabled'
  );
  assert.equal(
    enabled.createTurtle({ role: 'miner', bayId: 'bay-1', requestedBy: 'not-admin', mode: 'admin' }).reason,
    'admin_provider_denied'
  );
  assert.equal(
    enabled.createTurtle({ role: 'miner', bayId: 'bay-1', requestedBy: 'admin', mode: 'admin' }).ok,
    true
  );
});

test('factory failure cleanup releases provisioning bay', () => {
  const events = new EventStore();
  const leases = new LeaseManager();
  const factory = new FactoryService({
    enabled: true,
    leases,
    events,
    providers: {
      survival: createSurvivalProvider({ inventory: { 'computercraft:turtle_normal': 2, 'minecraft:coal': 2 } })
    }
  });
  const created = factory.createTurtle({ role: 'miner', bayId: 'bay-1', requestedBy: 'operator-a', now: 100 });
  const failed = factory.failJob(created.job.jobId, 'bootstrap_failed');
  const next = factory.createTurtle({ role: 'miner', bayId: 'bay-1', requestedBy: 'operator-b', now: 200 });

  assert.equal(failed.ok, true);
  assert.equal(next.ok, true);
});
