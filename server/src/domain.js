import { randomUUID } from 'node:crypto';

export class ControlPlaneDomain {
  #lastActionAt = new Map();
  #failureCounts = new Map();
  #rateLimitMs;

  constructor({ events, leases, commands, scripts, scheduler, factory }) {
    this.events = events;
    this.leases = leases;
    this.commands = commands;
    this.scripts = scripts;
    this.scheduler = scheduler;
    this.factory = factory;
    this.#rateLimitMs = 100;
  }

  acquireLease(input) {
    const result = this.leases.acquire(input);
    this.events.append({
      type: result.ok ? 'event.lease.acquired' : 'event.lease.rejected',
      aggregateType: 'lease',
      aggregateId: `${input.type}:${input.resourceId}`,
      payload: { request: input, result }
    });
    return result;
  }

  enqueueAction({ turtleId, action, args = [], lease, idempotencyKey, requestedBy, ttlMs = 5000 }) {
    if (!turtleId || !action) {
      return { ok: false, reason: 'missing_action_fields' };
    }
    if (!lease?.leaseId) {
      return { ok: false, reason: 'missing_lease' };
    }
    const now = Date.now();
    const last = this.#lastActionAt.get(turtleId) ?? 0;
    if (now - last < this.#rateLimitMs && !idempotencyKey) {
      return { ok: false, reason: 'rate_limited' };
    }
    this.#lastActionAt.set(turtleId, now);

    const leaseValidation = this.leases.validate({
      type: 'turtle_control',
      resourceId: turtleId,
      holder: lease.holder,
      leaseId: lease.leaseId
    });
    if (!leaseValidation.ok) {
      return leaseValidation;
    }

    const command = this.commands.enqueue({
      turtleId,
      kind: 'turtle.action',
      idempotencyKey,
      body: { action, args, ttlMs, requestedBy, leaseId: lease.leaseId }
    });
    this.events.append({
      type: 'event.command.queued',
      aggregateType: 'command',
      aggregateId: command.commandId,
      turtleId,
      payload: command
    });
    return { ok: true, command };
  }

  completeCommand(commandId, result) {
    const command = this.commands.complete(commandId, result);
    if (result?.success) {
      this.#failureCounts.set(command.turtleId, 0);
    } else {
      const failures = (this.#failureCounts.get(command.turtleId) ?? 0) + 1;
      this.#failureCounts.set(command.turtleId, failures);
      if (failures >= 3) {
        this.events.append({
          type: 'event.turtle.quarantined',
          aggregateType: 'turtle',
          aggregateId: command.turtleId,
          turtleId: command.turtleId,
          payload: { reason: 'repeated_command_failures', failures }
        });
      }
    }
    this.events.append({
      type: 'event.command.completed',
      aggregateType: 'command',
      aggregateId: commandId,
      turtleId: command.turtleId,
      jobId: command.jobId,
      payload: { command, result }
    });
    return command;
  }

  clearTurtleQueue(turtleId, reason = 'manual_clear') {
    const cleared = this.commands.clearForTurtle(turtleId);
    this.events.append({
      type: 'event.command_queue.cleared',
      aggregateType: 'turtle',
      aggregateId: turtleId,
      turtleId,
      payload: { cleared, reason }
    });
    return { ok: true, cleared };
  }

  createJob({ goalText, priority = 0, constraints = {}, createdBy = 'system' }) {
    const jobId = randomUUID();
    const plan = this.scheduler.plan(goalText, constraints);
    this.events.append({
      type: 'event.job.created',
      aggregateType: 'job',
      aggregateId: jobId,
      jobId,
      payload: { goalText, priority, constraints, createdBy, plan }
    });
    return { jobId, goalText, priority, constraints, plan };
  }

  assignJob({ jobId, turtles, requirements = {}, max = 1 }) {
    const selected = this.scheduler.selectTurtles({ turtles, requirements, max });
    if (selected.length === 0) {
      const reason = this.scheduler.blockedReason({ turtles, requirements });
      this.events.append({
        type: 'event.job.blocked',
        aggregateType: 'job',
        aggregateId: jobId,
        jobId,
        payload: { reason, requirements }
      });
      return { ok: false, reason };
    }
    this.events.append({
      type: 'event.job.assigned',
      aggregateType: 'job',
      aggregateId: jobId,
      jobId,
      payload: { turtleIds: selected.map((turtle) => turtle.turtleId), requirements }
    });
    return { ok: true, turtles: selected };
  }

  cancelJob(jobId, reason = 'cancelled') {
    this.events.append({
      type: 'event.job.cancelled',
      aggregateType: 'job',
      aggregateId: jobId,
      jobId,
      payload: { reason }
    });
    return { ok: true };
  }
}
