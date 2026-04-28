export class Scheduler {
  plan(goalText, constraints = {}) {
    if (!goalText || typeof goalText !== 'string') {
      throw new Error('goalText is required');
    }

    const lower = goalText.toLowerCase();
    const steps = [];
    if (lower.includes('mine') || lower.includes('quarry')) {
      steps.push('survey_boundary', 'reserve_work_volume', 'assign_dig_lanes', 'monitor_fuel_inventory', 'deposit_items');
    } else if (lower.includes('inspect') || lower.includes('survey')) {
      steps.push('reserve_survey_path', 'scan_cells', 'publish_world_updates');
    } else {
      steps.push('validate_goal', 'reserve_resources', 'execute_bounded_actions', 'verify_result');
    }

    return {
      goalText,
      constraints,
      steps: steps.map((kind, index) => ({ id: `step-${index + 1}`, kind, status: 'planned' }))
    };
  }

  selectTurtles({ turtles, requirements = {}, max = 1 }) {
    const candidates = turtles
      .filter((turtle) => turtle.status === 'online')
      .filter((turtle) => requirements.minFuel == null || turtle.fuel >= requirements.minFuel)
      .filter((turtle) => {
        const requiredCapabilities = requirements.capabilities ?? [];
        const capabilities = turtle.capabilities ?? [];
        return requiredCapabilities.every((capability) => capabilities.includes(capability));
      })
      .map((turtle) => ({
        turtle,
        score: this.#score(turtle, requirements)
      }))
      .sort((a, b) => b.score - a.score);

    return candidates.slice(0, max).map((candidate) => candidate.turtle);
  }

  blockedReason({ turtles, requirements = {} }) {
    if (!turtles.some((turtle) => turtle.status === 'online')) {
      return 'no_online_turtles';
    }
    if (requirements.minFuel != null && !turtles.some((turtle) => turtle.status === 'online' && turtle.fuel >= requirements.minFuel)) {
      return 'insufficient_fuel';
    }
    return 'no_matching_capabilities';
  }

  reserveCells({ world, cells, jobId, ttlMs = 60_000, now = new Date().toISOString() }) {
    const reservedUntil = new Date(Date.parse(now) + ttlMs).toISOString();
    const reservations = [];
    for (const cell of cells) {
      const result = world.reserve(cell, { reservedByJobId: jobId, reservedUntil }, now);
      if (!result.ok) {
        return { ok: false, reason: result.reason, reservations, conflict: result.reservation };
      }
      reservations.push(result.reservation);
    }
    return { ok: true, reservations };
  }

  recoveryPlan({ failureCode, jobId }) {
    const common = [
      { kind: 'pause_job', jobId },
      { kind: 'release_expired_leases', jobId },
      { kind: 'record_diagnostics', jobId }
    ];
    if (failureCode === 'blocked') {
      return [...common, { kind: 'inspect_blocking_cell', jobId }, { kind: 'replan_path', jobId }];
    }
    if (failureCode === 'low_fuel' || failureCode === 'fuel_below_minimum') {
      return [...common, { kind: 'route_to_refuel', jobId }];
    }
    if (failureCode === 'inventory_full') {
      return [...common, { kind: 'route_to_depot', jobId }];
    }
    return [...common, { kind: 'request_human_intervention', jobId }];
  }

  #score(turtle, requirements) {
    const fuelScore = Math.min(turtle.fuel ?? 0, requirements.minFuel ?? 0);
    const idleScore = turtle.activeJobId ? 0 : 20;
    const errorPenalty = turtle.lastError ? -25 : 0;
    return fuelScore + idleScore + errorPenalty;
  }
}
