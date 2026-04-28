export class FactoryService {
  #enabled;
  #leases;
  #events;
  #providers;
  #jobs = new Map();

  constructor({ enabled = false, leases, events, providers = {} } = {}) {
    this.#enabled = enabled;
    this.#leases = leases;
    this.#events = events;
    this.#providers = {
      survival: providers.survival ?? createSurvivalProvider(),
      admin: providers.admin ?? createAdminProvider({ enabled: false })
    };
  }

  setEnabled(enabled) {
    this.#enabled = Boolean(enabled);
  }

  createTurtle({ role, scriptId, bayId, requestedBy, mode = 'survival', now = Date.now() }) {
    if (!this.#enabled) {
      return { ok: false, reason: 'factory_disabled' };
    }
    if (!role || !bayId || !requestedBy) {
      return { ok: false, reason: 'missing_factory_request_fields' };
    }
    const provider = this.#providers[mode];
    if (!provider) {
      return { ok: false, reason: 'unknown_factory_provider' };
    }
    const providerCheck = provider.verify({ role, scriptId, bayId, requestedBy, mode });
    if (!providerCheck.ok) {
      return providerCheck;
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
    const job = {
      jobId,
      status: 'planned',
      role,
      scriptId,
      bayId,
      mode,
      lease: lease.lease,
      steps: [
        'verify_materials_or_admin_permission',
        'place_turtle',
        'bootstrap_runtime',
        'pair_turtle',
        'deploy_role_script',
        'move_out_of_bay'
      ]
    };
    this.#jobs.set(jobId, job);

    this.#events?.append({
      type: 'event.factory.requested',
      aggregateType: 'job',
      aggregateId: jobId,
      jobId,
      payload: { role, scriptId, bayId, mode, requestedBy, lease: lease.lease, provider: providerCheck }
    });

    return {
      ok: true,
      job
    };
  }

  failJob(jobId, reason) {
    const job = this.#jobs.get(jobId);
    if (!job) {
      return { ok: false, reason: 'unknown_factory_job' };
    }
    job.status = 'failed';
    job.failureReason = reason;
    this.#leases.release({ type: 'factory_slot', resourceId: job.bayId, holder: job.lease.holder });
    this.#events?.append({
      type: 'event.factory.failed',
      aggregateType: 'job',
      aggregateId: jobId,
      jobId,
      payload: { reason, bayId: job.bayId }
    });
    return { ok: true, job: { ...job } };
  }
}

export function createSurvivalProvider({ inventory = {} } = {}) {
  return {
    verify() {
      const turtle = inventory['computercraft:turtle_normal'] ?? inventory['computercraft:turtle_advanced'] ?? 0;
      const fuel = inventory['minecraft:coal'] ?? inventory['minecraft:charcoal'] ?? 0;
      if (turtle < 1) {
        return { ok: false, reason: 'missing_turtle_item' };
      }
      if (fuel < 1) {
        return { ok: false, reason: 'missing_startup_fuel' };
      }
      return { ok: true, provider: 'survival' };
    }
  };
}

export function createAdminProvider({ enabled = false, allowedRequesters = [] } = {}) {
  return {
    verify({ requestedBy }) {
      if (!enabled) {
        return { ok: false, reason: 'admin_provider_disabled' };
      }
      if (allowedRequesters.length > 0 && !allowedRequesters.includes(requestedBy)) {
        return { ok: false, reason: 'admin_provider_denied' };
      }
      return { ok: true, provider: 'admin' };
    }
  };
}
