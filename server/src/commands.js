import { randomUUID } from 'node:crypto';

export class CommandQueue {
  #commands = [];
  #idempotency = new Map();

  enqueue(command) {
    if (!command?.turtleId || !command.kind) {
      throw new Error('command turtleId and kind are required');
    }
    if (command.idempotencyKey && this.#idempotency.has(command.idempotencyKey)) {
      return this.#idempotency.get(command.idempotencyKey);
    }

    const queued = {
      commandId: command.commandId ?? randomUUID(),
      turtleId: command.turtleId,
      jobId: command.jobId ?? null,
      kind: command.kind,
      body: command.body ?? {},
      status: 'queued',
      idempotencyKey: command.idempotencyKey ?? null,
      createdAt: command.createdAt ?? new Date().toISOString(),
      completedAt: null,
      result: null
    };
    this.#commands.push(queued);

    if (queued.idempotencyKey) {
      this.#idempotency.set(queued.idempotencyKey, queued);
    }

    return queued;
  }

  nextForTurtle(turtleId, now = Date.now()) {
    const command = this.#commands.find((item) => {
      if (item.turtleId !== turtleId || item.status !== 'queued') {
        return false;
      }
      if (!item.body.ttlMs) {
        return true;
      }
      return Date.parse(item.createdAt) + item.body.ttlMs > now;
    });

    if (!command) {
      return null;
    }

    command.status = 'sent';
    return command;
  }

  complete(commandId, result) {
    const command = this.#commands.find((item) => item.commandId === commandId);
    if (!command) {
      throw new Error('unknown command');
    }
    command.status = result?.success ? 'succeeded' : 'failed';
    command.result = result ?? {};
    command.completedAt = new Date().toISOString();
    return command;
  }

  cancel(commandId) {
    const command = this.#commands.find((item) => item.commandId === commandId);
    if (!command || command.status !== 'queued') {
      return false;
    }
    command.status = 'cancelled';
    command.completedAt = new Date().toISOString();
    return true;
  }

  clearForTurtle(turtleId) {
    let cleared = 0;
    for (const command of this.#commands) {
      if (command.turtleId === turtleId && command.status === 'queued') {
        command.status = 'cancelled';
        command.completedAt = new Date().toISOString();
        cleared += 1;
      }
    }
    return cleared;
  }

  all() {
    return this.#commands.map((command) => ({ ...command }));
  }
}
