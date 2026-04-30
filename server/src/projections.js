const DIRECTIONS = ['north', 'east', 'south', 'west'];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cellKey({ dimension = 'overworld', x, y, z }) {
  return `${dimension}:${x}:${y}:${z}`;
}

function forwardOffset(facing) {
  switch (facing) {
    case 'north':
      return { x: 0, y: 0, z: -1 };
    case 'south':
      return { x: 0, y: 0, z: 1 };
    case 'east':
      return { x: 1, y: 0, z: 0 };
    case 'west':
      return { x: -1, y: 0, z: 0 };
    default:
      return { x: 0, y: 0, z: 0 };
  }
}

export function turnFacing(facing, turn) {
  const index = DIRECTIONS.indexOf(facing);
  if (index === -1) {
    return facing;
  }
  const delta = turn === 'left' ? -1 : 1;
  return DIRECTIONS[(index + delta + DIRECTIONS.length) % DIRECTIONS.length];
}

export function observedCellFromDirection(origin, direction) {
  if (!origin?.position) {
    return null;
  }
  const [x, y, z] = origin.position;
  const dimension = origin.dimension ?? 'overworld';
  if (direction === 'up') {
    return { dimension, x, y: y + 1, z };
  }
  if (direction === 'down') {
    return { dimension, x, y: y - 1, z };
  }
  if (direction === 'north') {
    return { dimension, x, y, z: z - 1 };
  }
  if (direction === 'south') {
    return { dimension, x, y, z: z + 1 };
  }
  if (direction === 'east') {
    return { dimension, x: x + 1, y, z };
  }
  if (direction === 'west') {
    return { dimension, x: x - 1, y, z };
  }
  const offset = forwardOffset(origin.facing);
  return {
    dimension,
    x: x + offset.x,
    y: y + offset.y,
    z: z + offset.z
  };
}

export function occupancyFromObservation(observation) {
  if (observation?.occupancy) {
    return observation.occupancy;
  }
  if (observation?.block?.name === 'minecraft:air') {
    return 'air';
  }
  if (observation?.block?.name) {
    return observation.block.name.includes('water') || observation.block.name.includes('lava')
      ? 'liquid'
      : 'solid';
  }
  if (observation?.error?.code === 'no_block') {
    return 'air';
  }
  if (observation?.success === false) {
    return 'unknown';
  }
  return 'air';
}

export class FleetProjection {
  #turtles = new Map();
  #jobs = new Map();

  apply(event) {
    if (event.aggregateType === 'job') {
      this.#applyJob(event);
    }
    if (!event.turtleId) {
      return;
    }
    const turtle = this.#ensureTurtle(event.turtleId);
    if (event.type === 'event.turtle.booted' || event.type === 'event.turtle.heartbeat') {
      this.#applyTurtleTelemetry(turtle, event);
    }
    if (event.type === 'event.action.started') {
      turtle.status = 'busy';
      turtle.activeCommandId = event.payload.commandId ?? event.payload.command_id ?? null;
      turtle.updatedAt = event.createdAt;
    }
    if (event.type === 'event.action.completed') {
      turtle.status = 'online';
      turtle.activeCommandId = null;
      turtle.updatedAt = event.createdAt;
      if (event.payload.after) {
        Object.assign(turtle, this.#telemetryFields(event.payload.after));
      }
      if (event.payload.success === false) {
        turtle.lastError = event.payload.error ?? { code: 'action_failed' };
      }
    }
    if (event.type === 'event.world.scanned') {
      turtle.status = 'online';
      turtle.lastScanAt = event.createdAt;
      turtle.lastScanCount = event.payload.observations?.length ?? 0;
      turtle.updatedAt = event.createdAt;
      if (event.payload.after || event.payload.origin) {
        Object.assign(turtle, this.#telemetryFields(event.payload.after ?? event.payload.origin));
      }
    }
    if (event.type === 'event.turtle.quarantined') {
      turtle.status = 'quarantined';
      turtle.lastError = { code: 'quarantined', message: event.payload.reason };
      turtle.updatedAt = event.createdAt;
    }
  }

  replay(events) {
    for (const event of events) {
      this.apply(event);
    }
    return this;
  }

  turtles() {
    return [...this.#turtles.values()].map(clone);
  }

  turtle(turtleId) {
    return clone(this.#turtles.get(turtleId) ?? null);
  }

  jobs() {
    return [...this.#jobs.values()].map(clone);
  }

  job(jobId) {
    return clone(this.#jobs.get(jobId) ?? null);
  }

  #ensureTurtle(turtleId) {
    if (!this.#turtles.has(turtleId)) {
      this.#turtles.set(turtleId, {
        turtleId,
        status: 'online',
        position: null,
        facing: null,
        dimension: 'overworld',
        positionConfidence: null,
        fuel: null,
        selectedSlot: null,
        inventory: {},
        runtimeVersion: null,
        lastHeartbeatAt: null,
        activeJobId: null,
        activeCommandId: null,
        lastError: null,
        lastScanAt: null,
        lastScanCount: 0,
        updatedAt: null
      });
    }
    return this.#turtles.get(turtleId);
  }

  #telemetryFields(payload) {
    const fields = {};
    if ('computer_id' in payload || 'computerId' in payload) {
      fields.computerId = payload.computer_id ?? payload.computerId;
    }
    if ('label' in payload) {
      fields.label = payload.label;
    }
    if ('position' in payload) {
      fields.position = payload.position;
    }
    if ('facing' in payload) {
      fields.facing = payload.facing;
    }
    if ('dimension' in payload) {
      fields.dimension = payload.dimension;
    }
    if ('position_confidence' in payload || 'positionConfidence' in payload || 'confidence' in payload) {
      fields.positionConfidence = payload.position_confidence ?? payload.positionConfidence ?? payload.confidence;
    }
    if ('fuel' in payload) {
      fields.fuel = payload.fuel;
    }
    if ('fuel_limit' in payload || 'fuelLimit' in payload) {
      fields.fuelLimit = payload.fuel_limit ?? payload.fuelLimit;
    }
    if ('selected_slot' in payload || 'selectedSlot' in payload) {
      fields.selectedSlot = payload.selected_slot ?? payload.selectedSlot;
    }
    if ('inventory' in payload) {
      fields.inventory = payload.inventory ?? {};
    }
    if ('runtime_version' in payload || 'runtimeVersion' in payload) {
      fields.runtimeVersion = payload.runtime_version ?? payload.runtimeVersion;
    }
    return fields;
  }

  #applyTurtleTelemetry(turtle, event) {
    Object.assign(turtle, this.#telemetryFields(event.payload));
    turtle.status = 'online';
    turtle.lastHeartbeatAt = event.createdAt;
    turtle.updatedAt = event.createdAt;
  }

  #applyJob(event) {
    const jobId = event.aggregateId;
    const current = this.#jobs.get(jobId) ?? {
      jobId,
      goalText: null,
      status: 'planned',
      priority: 0,
      plan: null,
      assignedTurtles: [],
      lastError: null,
      createdAt: event.createdAt,
      updatedAt: event.createdAt
    };

    if (event.type === 'event.job.created') {
      current.goalText = event.payload.goalText ?? current.goalText;
      current.priority = event.payload.priority ?? current.priority;
      current.plan = event.payload.plan ?? current.plan;
      current.status = 'planned';
    }
    if (event.type === 'event.job.assigned') {
      current.status = 'running';
      current.assignedTurtles = event.payload.turtleIds ?? current.assignedTurtles;
    }
    if (event.type === 'event.job.blocked') {
      current.status = 'blocked';
      current.lastError = event.payload.reason ?? null;
    }
    if (event.type === 'event.job.completed') {
      current.status = 'succeeded';
    }
    if (event.type === 'event.job.cancelled') {
      current.status = 'cancelled';
    }
    if (event.type === 'event.job.failed') {
      current.status = 'failed';
      current.lastError = event.payload.error ?? null;
    }

    current.updatedAt = event.createdAt;
    this.#jobs.set(jobId, current);
  }
}

export class WorldModel {
  #cells = new Map();
  #reservations = new Map();

  apply(event) {
    if (event.type === 'event.world.cell_observed') {
      this.upsertCell(event.payload.cell, event.payload.observation, event);
    }
    if (event.type === 'event.action.completed') {
      this.#applyActionCompleted(event);
    }
    if (event.type === 'event.world.scanned') {
      this.#applyWorldScanned(event);
    }
    if (event.type === 'event.world.cell_reserved') {
      this.reserve(event.payload.cell, event.payload.reservation, event.createdAt);
    }
  }

  replay(events) {
    for (const event of events) {
      this.apply(event);
    }
    return this;
  }

  upsertCell(cell, observation, event = {}) {
    if (!cell || !Number.isInteger(cell.x) || !Number.isInteger(cell.y) || !Number.isInteger(cell.z)) {
      throw new Error('valid cell coordinates are required');
    }
    const normalized = {
      dimension: cell.dimension ?? 'overworld',
      x: cell.x,
      y: cell.y,
      z: cell.z
    };
    const model = {
      ...normalized,
      blockName: observation?.block?.name ?? null,
      state: observation?.block?.state ?? {},
      tags: observation?.block?.tags ?? [],
      occupancy: occupancyFromObservation(observation),
      confidence: observation?.confidence ?? 1,
      lastSeenBy: event.turtleId ?? observation?.lastSeenBy ?? null,
      lastSeenAt: event.createdAt ?? observation?.lastSeenAt ?? new Date().toISOString()
    };
    this.#cells.set(cellKey(normalized), model);
    return clone(model);
  }

  reserve(cell, reservation, createdAt = new Date().toISOString()) {
    const key = cellKey({ dimension: cell.dimension ?? 'overworld', x: cell.x, y: cell.y, z: cell.z });
    const existing = this.#reservations.get(key);
    const now = Date.parse(createdAt);
    if (existing && Date.parse(existing.reservedUntil) > now && existing.reservedByJobId !== reservation.reservedByJobId) {
      return { ok: false, reason: 'reservation_conflict', reservation: clone(existing) };
    }
    const stored = {
      dimension: cell.dimension ?? 'overworld',
      x: cell.x,
      y: cell.y,
      z: cell.z,
      reservedByJobId: reservation.reservedByJobId,
      reservedUntil: reservation.reservedUntil,
      createdAt
    };
    this.#reservations.set(key, stored);
    return { ok: true, reservation: clone(stored) };
  }

  getCell(cell) {
    const normalized = {
      dimension: cell.dimension ?? 'overworld',
      x: cell.x,
      y: cell.y,
      z: cell.z
    };
    const existing = this.#cells.get(cellKey(normalized));
    if (!existing) {
      return {
        ...normalized,
        blockName: null,
        state: {},
        tags: [],
        occupancy: 'unknown',
        confidence: 0,
        lastSeenBy: null,
        lastSeenAt: null,
        reservation: this.#reservations.get(cellKey(normalized)) ?? null
      };
    }
    return {
      ...clone(existing),
      reservation: clone(this.#reservations.get(cellKey(normalized)) ?? null)
    };
  }

  query({ dimension = 'overworld', minX, maxX, minY, maxY, minZ, maxZ }) {
    const cells = [];
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          cells.push(this.getCell({ dimension, x, y, z }));
        }
      }
    }
    return cells;
  }

  #applyActionCompleted(event) {
    for (const observation of event.payload.observations ?? []) {
      const explicitCell = observation.cell;
      const inferredCell = explicitCell ?? observedCellFromDirection(event.payload.before, observation.direction);
      if (inferredCell) {
        this.upsertCell(inferredCell, observation, event);
      }
    }
  }

  #applyWorldScanned(event) {
    for (const observation of event.payload.observations ?? []) {
      const explicitCell = observation.cell;
      const inferredCell = explicitCell ?? observedCellFromDirection(event.payload.origin, observation.direction);
      if (inferredCell) {
        this.upsertCell(inferredCell, observation, event);
      }
    }
  }
}

export class DiagnosticsProjection {
  #items = [];

  apply(event) {
    const payload = event.payload ?? {};
    if (payload.error || event.type.endsWith('.failed') || event.type.includes('crashed')) {
      this.#items.push({
        eventId: event.eventId,
        type: event.type,
        turtleId: event.turtleId,
        jobId: event.jobId,
        error: payload.error ?? payload.reason ?? { code: event.type },
        createdAt: event.createdAt
      });
    }
  }

  replay(events) {
    for (const event of events) {
      this.apply(event);
    }
    return this;
  }

  recent({ limit = 20 } = {}) {
    return this.#items.slice(-limit).reverse().map(clone);
  }
}

export function buildReadModels(events) {
  const allEvents = typeof events.all === 'function' ? events.all() : events;
  return {
    fleet: new FleetProjection().replay(allEvents),
    world: new WorldModel().replay(allEvents),
    diagnostics: new DiagnosticsProjection().replay(allEvents)
  };
}
