import { randomUUID } from 'node:crypto';

export class EventStore {
  #events = [];
  #aggregateSeq = new Map();

  append(event) {
    if (!event?.type) {
      throw new Error('event.type is required');
    }
    if (!event.aggregateType || !event.aggregateId) {
      throw new Error('event aggregate is required');
    }

    const key = `${event.aggregateType}:${event.aggregateId}`;
    const seq = (this.#aggregateSeq.get(key) ?? 0) + 1;
    this.#aggregateSeq.set(key, seq);

    const stored = Object.freeze({
      eventId: event.eventId ?? randomUUID(),
      type: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      seq,
      causationId: event.causationId ?? null,
      correlationId: event.correlationId ?? null,
      turtleId: event.turtleId ?? null,
      jobId: event.jobId ?? null,
      payload: event.payload ?? {},
      createdAt: event.createdAt ?? new Date().toISOString()
    });

    this.#events.push(stored);
    return stored;
  }

  all() {
    return [...this.#events];
  }

  byAggregate(aggregateType, aggregateId) {
    return this.#events.filter(
      (event) => event.aggregateType === aggregateType && event.aggregateId === aggregateId
    );
  }

  byTurtle(turtleId) {
    return this.#events.filter((event) => event.turtleId === turtleId);
  }

  byJob(jobId) {
    return this.#events.filter((event) => event.jobId === jobId);
  }
}

