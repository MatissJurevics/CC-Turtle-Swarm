import { randomUUID } from 'node:crypto';

export class LeaseManager {
  #leases = new Map();

  acquire({ type, resourceId, holder, ttlMs, now = Date.now() }) {
    if (!type || !resourceId || !holder) {
      throw new Error('type, resourceId, and holder are required');
    }
    if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
      throw new Error('ttlMs must be a positive integer');
    }

    const key = `${type}:${resourceId}`;
    const existing = this.#leases.get(key);
    if (existing && existing.expiresAt > now && existing.holder !== holder) {
      return { ok: false, reason: 'lease_conflict', lease: existing };
    }

    const lease = {
      leaseId: existing?.holder === holder ? existing.leaseId : randomUUID(),
      type,
      resourceId,
      holder,
      acquiredAt: now,
      expiresAt: now + ttlMs
    };
    this.#leases.set(key, lease);
    return { ok: true, lease };
  }

  validate({ type, resourceId, holder, leaseId, now = Date.now() }) {
    const lease = this.#leases.get(`${type}:${resourceId}`);
    if (!lease) {
      return { ok: false, reason: 'missing_lease' };
    }
    if (lease.expiresAt <= now) {
      return { ok: false, reason: 'expired_lease', lease };
    }
    if (lease.holder !== holder || lease.leaseId !== leaseId) {
      return { ok: false, reason: 'lease_mismatch', lease };
    }
    return { ok: true, lease };
  }

  release({ type, resourceId, holder }) {
    const key = `${type}:${resourceId}`;
    const lease = this.#leases.get(key);
    if (!lease) {
      return false;
    }
    if (lease.holder !== holder) {
      return false;
    }
    this.#leases.delete(key);
    return true;
  }
}

