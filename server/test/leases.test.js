import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LeaseManager } from '../src/leases.js';

test('acquires and validates active lease', () => {
  const leases = new LeaseManager();
  const result = leases.acquire({
    type: 'turtle_control',
    resourceId: 'turtle-001',
    holder: 'operator-a',
    ttlMs: 1000,
    now: 100
  });

  assert.equal(result.ok, true);
  assert.equal(
    leases.validate({
      type: 'turtle_control',
      resourceId: 'turtle-001',
      holder: 'operator-a',
      leaseId: result.lease.leaseId,
      now: 200
    }).ok,
    true
  );
});

test('prevents conflicting active leases', () => {
  const leases = new LeaseManager();
  leases.acquire({
    type: 'turtle_control',
    resourceId: 'turtle-001',
    holder: 'operator-a',
    ttlMs: 1000,
    now: 100
  });

  const conflict = leases.acquire({
    type: 'turtle_control',
    resourceId: 'turtle-001',
    holder: 'operator-b',
    ttlMs: 1000,
    now: 200
  });

  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, 'lease_conflict');
});

test('allows replacing expired leases', () => {
  const leases = new LeaseManager();
  leases.acquire({
    type: 'turtle_control',
    resourceId: 'turtle-001',
    holder: 'operator-a',
    ttlMs: 100,
    now: 100
  });

  const replacement = leases.acquire({
    type: 'turtle_control',
    resourceId: 'turtle-001',
    holder: 'operator-b',
    ttlMs: 100,
    now: 300
  });

  assert.equal(replacement.ok, true);
  assert.equal(replacement.lease.holder, 'operator-b');
});

test('releases only by holder', () => {
  const leases = new LeaseManager();
  leases.acquire({
    type: 'factory_slot',
    resourceId: 'bay-1',
    holder: 'job-001',
    ttlMs: 1000,
    now: 100
  });

  assert.equal(leases.release({ type: 'factory_slot', resourceId: 'bay-1', holder: 'job-002' }), false);
  assert.equal(leases.release({ type: 'factory_slot', resourceId: 'bay-1', holder: 'job-001' }), true);
});

