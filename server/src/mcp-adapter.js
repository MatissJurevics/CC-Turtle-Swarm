import { randomUUID } from 'node:crypto';

const TOOL_DEFINITIONS = [
  { name: 'fleet.list_turtles', mutates: false, description: 'Return turtles, status, capabilities, and location.' },
  { name: 'fleet.get_turtle_state', mutates: false, description: 'Return materialized state for one turtle.' },
  { name: 'world.query_cells', mutates: false, description: 'Read known world cells in a volume.' },
  { name: 'logs.search', mutates: false, description: 'Search events by turtle, job, or error.' },
  { name: 'jobs.plan', mutates: false, description: 'Produce a proposed plan without execution.' },
  { name: 'jobs.create', mutates: true, description: 'Create a job from a goal and constraints.' },
  { name: 'jobs.assign', mutates: true, description: 'Allocate turtles and enqueue work.' },
  { name: 'jobs.cancel', mutates: true, description: 'Cancel a job.' },
  { name: 'leases.acquire', mutates: true, description: 'Acquire a manual or work-volume lease.' },
  { name: 'turtle.action', mutates: true, description: 'Execute one atomic turtle action under a lease.' },
  { name: 'scripts.validate', mutates: false, description: 'Validate script manifest and source bundle.' },
  { name: 'scripts.deploy', mutates: true, description: 'Store a script package.' },
  { name: 'scripts.run', mutates: true, description: 'Queue a script run command for a turtle.' },
  { name: 'factory.create_turtle', mutates: true, description: 'Create/provision a turtle through factory workflow.' },
  { name: 'diagnostics.explain_failure', mutates: false, description: 'Summarize likely cause and next repair action.' }
];

function requireConfirmation(definition, confirmed) {
  if (definition.mutates && !confirmed) {
    return { ok: false, reason: 'confirmation_required' };
  }
  return null;
}

export class McpAdapter {
  constructor({ plane }) {
    this.plane = plane;
  }

  listResources() {
    return [
      'fleet://overview',
      'errors://recent?severity=error',
      ...this.plane.readModels().fleet.turtles().flatMap((turtle) => [
        `turtle://${turtle.turtleId}/state`,
        `turtle://${turtle.turtleId}/inventory`,
        `turtle://${turtle.turtleId}/logs`,
        `turtle://${turtle.turtleId}/capabilities`
      ]),
      ...this.plane.readModels().fleet.jobs().map((job) => `job://${job.jobId}`)
    ];
  }

  readResource(uri) {
    const url = new URL(uri);
    const models = this.plane.readModels();

    if (url.protocol === 'fleet:') {
      return { turtles: models.fleet.turtles(), jobs: models.fleet.jobs(), diagnostics: models.diagnostics.recent() };
    }
    if (url.protocol === 'errors:') {
      return { errors: models.diagnostics.recent({ limit: Number(url.searchParams.get('limit') ?? 20) }) };
    }
    if (url.protocol === 'turtle:') {
      const turtleId = url.hostname;
      const part = url.pathname.replace(/^\//, '') || 'state';
      const turtle = models.fleet.turtle(turtleId);
      if (!turtle) {
        return { ok: false, reason: 'unknown_turtle' };
      }
      if (part === 'inventory') {
        return { turtleId, inventory: turtle.inventory };
      }
      if (part === 'logs') {
        return { turtleId, events: this.plane.events.byTurtle(turtleId) };
      }
      if (part === 'capabilities') {
        return { turtleId, capabilities: turtle.capabilities ?? [] };
      }
      return turtle;
    }
    if (url.protocol === 'job:') {
      return models.fleet.job(url.hostname) ?? { ok: false, reason: 'unknown_job' };
    }
    if (url.protocol === 'world:') {
      if (url.hostname === 'query') {
        return {
          cells: models.world.query({
            dimension: url.searchParams.get('dimension') ?? 'overworld',
            minX: Number(url.searchParams.get('minX') ?? 0),
            maxX: Number(url.searchParams.get('maxX') ?? 0),
            minY: Number(url.searchParams.get('minY') ?? 0),
            maxY: Number(url.searchParams.get('maxY') ?? 0),
            minZ: Number(url.searchParams.get('minZ') ?? 0),
            maxZ: Number(url.searchParams.get('maxZ') ?? 0)
          })
        };
      }
    }

    return { ok: false, reason: 'unknown_resource' };
  }

  listTools() {
    return TOOL_DEFINITIONS.map((tool) => ({
      ...tool,
      confirmationRequired: tool.mutates,
      inputSchema: { type: 'object' }
    }));
  }

  callTool(name, args = {}, context = {}) {
    const definition = TOOL_DEFINITIONS.find((tool) => tool.name === name);
    if (!definition) {
      return { ok: false, reason: 'unknown_tool' };
    }
    const confirmationError = requireConfirmation(definition, context.confirmed);
    if (confirmationError) {
      this.#audit(name, args, context, confirmationError);
      return confirmationError;
    }

    const result = this.#dispatch(name, args, context);
    this.#audit(name, args, context, result);
    return result;
  }

  #dispatch(name, args) {
    const models = this.plane.readModels();
    switch (name) {
      case 'fleet.list_turtles':
        return { ok: true, turtles: models.fleet.turtles() };
      case 'fleet.get_turtle_state':
        return { ok: true, turtle: models.fleet.turtle(args.turtleId) };
      case 'world.query_cells':
        return { ok: true, cells: models.world.query(args) };
      case 'logs.search':
        return { ok: true, events: this.#searchLogs(args) };
      case 'jobs.plan':
        return { ok: true, plan: this.plane.scheduler.plan(args.goalText, args.constraints ?? {}) };
      case 'jobs.create':
        return { ok: true, job: this.plane.domain.createJob(args) };
      case 'jobs.assign':
        return this.plane.domain.assignJob(args);
      case 'jobs.cancel':
        return this.plane.domain.cancelJob(args.jobId, args.reason);
      case 'leases.acquire':
        return this.plane.domain.acquireLease(args);
      case 'turtle.action':
        return this.plane.domain.enqueueAction(args);
      case 'scripts.validate':
        return this.plane.scripts.validatePackage(args);
      case 'scripts.deploy':
        return this.plane.scripts.deploy(args);
      case 'scripts.run':
        return this.#runScript(args);
      case 'factory.create_turtle':
        return this.plane.factory.createTurtle(args);
      case 'diagnostics.explain_failure':
        return this.#explainFailure(args);
      default:
        return { ok: false, reason: 'unknown_tool' };
    }
  }

  #searchLogs({ turtleId, jobId, errorOnly = false } = {}) {
    let events = this.plane.events.all();
    if (turtleId) {
      events = events.filter((event) => event.turtleId === turtleId);
    }
    if (jobId) {
      events = events.filter((event) => event.jobId === jobId);
    }
    if (errorOnly) {
      events = events.filter((event) => event.payload?.error || event.type.endsWith('.failed'));
    }
    return events;
  }

  #runScript(args) {
    const allowed = this.plane.scripts.canRun(args.scriptId, args.permissions ?? []);
    if (!allowed.ok) {
      return allowed;
    }
    return this.plane.domain.enqueueAction({
      turtleId: args.turtleId,
      action: 'script.run',
      args: [args.scriptId, args.entryArgs ?? {}],
      lease: args.lease,
      idempotencyKey: args.idempotencyKey,
      requestedBy: args.requestedBy ?? 'mcp',
      ttlMs: args.ttlMs ?? 30_000
    });
  }

  #explainFailure({ eventId } = {}) {
    const event = eventId
      ? this.plane.events.all().find((item) => item.eventId === eventId)
      : this.plane.readModels().diagnostics.recent({ limit: 1 })[0];
    if (!event) {
      return { ok: false, reason: 'no_failure_found' };
    }
    const error = event.payload?.error ?? event.error ?? {};
    return {
      ok: true,
      error,
      likelyCause: error.code === 'blocked' ? 'movement_obstructed' : error.code ?? 'unknown',
      nextAction: error.code === 'blocked' ? 'inspect the blocking cell and replan path' : 'review turtle logs and recent events'
    };
  }

  #audit(name, args, context, result) {
    this.plane.events.append({
      type: 'event.audit.mcp_tool_call',
      aggregateType: 'mcp',
      aggregateId: randomUUID(),
      payload: {
        tool: name,
        args,
        confirmed: Boolean(context.confirmed),
        requestedBy: context.requestedBy ?? 'mcp',
        result: { ok: result.ok, reason: result.reason ?? null }
      }
    });
  }
}

