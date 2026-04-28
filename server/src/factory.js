export class FactoryService {
  #enabled;
  #leases;
  #events;

  constructor({ enabled = false, leases, events } = {}) {
    this.#enabled = enabled;
    this.#leases = leases;
    this.#events = events;
  }

  setEnabled(enabled) {
    this.#enabled = Boolean(enabled);
  }

  createTurtle({ role, scriptId, bayId, requestedBy, now = Date.now() }) {
    if (!this.#enabled) {
      return { ok: false, reason: 'factory_disabled' };
    }
    if (!role || !bayId || !requestedBy) {
      return { ok: false, reason: 'missing_factory_request_fields' };
    }

    const lease = this.#leases.acquire({
      type: 'factory_slot',
      resourceId: bayId,
      holder: requestedBy,
      ttlMs: 15 * 60 * 1000,
      now
    });
    if (!lease.ok) {
      return lease;
    }

    const jobId = `factory-${bayId}-${now}`;
    this.#events?.append({
      type: 'event.factory.requested',
      aggregateType: 'job',
      aggregateId: jobId,
      jobId,
      payload: { role, scriptId, bayId, requestedBy, lease: lease.lease }
    });

    return {
      ok: true,
      job: {
        jobId,
        status: 'planned',
        role,
        scriptId,
        bayId,
        lease: lease.lease,
        steps: [
          'verify_materials_or_admin_permission',
          'place_turtle',
          'bootstrap_runtime',
          'pair_turtle',
          'deploy_role_script',
          'move_out_of_bay'
        ]
      }
    };
  }
}

