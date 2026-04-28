import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventStore } from '../src/event-store.js';
import { LeaseManager } from '../src/leases.js';
import { FactoryService } from '../src/factory.js';

test('factory is disabled by default', () => {
  const factory = new FactoryService();
  const result = factory.createTurtle({ role: 'miner', bayId: 'bay-1', requestedBy: 'operator-a' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'factory_disabled');
});

test('enabled factory reserves a provisioning bay and emits event', () => {
  const events = new EventStore();
  const leases = new LeaseManager();
  const factory = new FactoryService({ enabled: true, leases, events });

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
  const factory = new FactoryService({ enabled: true, leases, events });

  factory.createTurtle({ role: 'miner', bayId: 'bay-1', requestedBy: 'operator-a', now: 100 });
  const conflict = factory.createTurtle({ role: 'miner', bayId: 'bay-1', requestedBy: 'operator-b', now: 200 });

  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, 'lease_conflict');
});

