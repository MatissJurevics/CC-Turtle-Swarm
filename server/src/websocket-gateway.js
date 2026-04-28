import { createHash, randomUUID } from 'node:crypto';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeFrame(payload) {
  const body = Buffer.from(JSON.stringify(payload));
  const header = [];
  header.push(0x81);
  if (body.length < 126) {
    header.push(body.length);
  } else if (body.length < 65536) {
    header.push(126, (body.length >> 8) & 0xff, body.length & 0xff);
  } else {
    throw new Error('websocket payload too large');
  }
  return Buffer.concat([Buffer.from(header), body]);
}

function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      if (cursor + 2 > buffer.length) {
        break;
      }
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    }
    if (length === 127) {
      throw new Error('large websocket frames are not supported');
    }
    let mask = null;
    if (masked) {
      if (cursor + 4 > buffer.length) {
        break;
      }
      mask = buffer.subarray(cursor, cursor + 4);
      cursor += 4;
    }
    if (cursor + length > buffer.length) {
      break;
    }
    const payload = Buffer.from(buffer.subarray(cursor, cursor + length));
    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }
    if (opcode === 0x8) {
      messages.push({ type: 'close' });
    } else if (opcode === 0x1) {
      messages.push({ type: 'text', data: payload.toString('utf8') });
    }
    offset = cursor + length;
  }
  return { messages, remaining: buffer.subarray(offset) };
}

export class WebSocketGateway {
  #plane;
  #pairingToken;
  #connections = new Map();

  constructor({ plane, pairingToken = 'dev-pairing-token' }) {
    this.#plane = plane;
    this.#pairingToken = pairingToken;
  }

  handleUpgrade(req, socket) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/turtle/ws') {
      socket.destroy();
      return;
    }

    const turtleId = url.searchParams.get('turtle_id');
    const token = url.searchParams.get('token');
    if (!turtleId || token !== this.#pairingToken) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const key = req.headers['sec-websocket-key'];
    const accept = createHash('sha1').update(`${key}${WS_GUID}`).digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n'
    ].join('\r\n'));

    this.#connections.set(turtleId, socket);
    this.#plane.events.append({
      type: 'event.turtle.connected',
      aggregateType: 'turtle',
      aggregateId: turtleId,
      turtleId,
      payload: { transport: 'websocket' }
    });
    this.#send(socket, { type: 'event.gateway.ready', turtle_id: turtleId });

    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const decoded = decodeFrames(buffer);
      buffer = decoded.remaining;
      for (const message of decoded.messages) {
        if (message.type === 'close') {
          socket.end();
          continue;
        }
        this.#handleMessage(turtleId, socket, message.data);
      }
    });
    socket.on('close', () => {
      if (this.#connections.get(turtleId) === socket) {
        this.#connections.delete(turtleId);
      }
      this.#plane.events.append({
        type: 'event.turtle.disconnected',
        aggregateType: 'turtle',
        aggregateId: turtleId,
        turtleId,
        payload: { transport: 'websocket' }
      });
    });
  }

  sendCommand(turtleId, command) {
    const socket = this.#connections.get(turtleId);
    if (!socket) {
      return false;
    }
    this.#send(socket, { type: 'command.request', body: command });
    return true;
  }

  connectedTurtles() {
    return [...this.#connections.keys()];
  }

  #handleMessage(turtleId, socket, raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      this.#send(socket, { type: 'error', reason: 'invalid_json' });
      return;
    }

    if (message.type === 'event.turtle.heartbeat') {
      const event = this.#plane.recordHeartbeat(turtleId, message.body ?? {});
      this.#send(socket, { type: 'ack', event_ids: [event.eventId] });
      return;
    }

    if (message.type === 'event.spool') {
      const acked = [];
      for (const item of message.events ?? []) {
        const payload = item.body ?? item.payload ?? {};
        const event = this.#plane.events.append({
          eventId: item.event_id ?? item.eventId ?? randomUUID(),
          type: item.type,
          aggregateType: item.aggregate_type ?? item.aggregateType ?? 'turtle',
          aggregateId: item.aggregate_id ?? item.aggregateId ?? turtleId,
          turtleId,
          jobId: item.job_id ?? item.jobId ?? null,
          payload,
          createdAt: item.created_at ?? item.createdAt
        });
        if (item.type === 'event.action.completed' && (payload.command_id || payload.commandId)) {
          try {
            this.#plane.domain.completeCommand(payload.command_id ?? payload.commandId, { success: payload.success, body: payload });
          } catch {
            // Preserve replayed turtle events even when the command is no longer in memory.
          }
        }
        acked.push(event.eventId);
      }
      this.#send(socket, { type: 'ack', event_ids: acked });
      return;
    }

    if (message.type === 'command.next') {
      const command = this.#plane.commands.nextForTurtle(turtleId);
      this.#send(socket, { type: command ? 'command.request' : 'command.idle', body: command });
      return;
    }

    if (message.type === 'event.action.completed') {
      const body = message.body ?? {};
      this.#plane.events.append({
        type: 'event.action.completed',
        aggregateType: 'command',
        aggregateId: body.command_id ?? body.commandId ?? randomUUID(),
        turtleId,
        jobId: body.job_id ?? body.jobId ?? null,
        payload: body
      });
      if (body.command_id || body.commandId) {
        try {
          this.#plane.domain.completeCommand(body.command_id ?? body.commandId, { success: body.success, body });
        } catch {
          // Completion may arrive for commands created before reconnect; keep the event.
        }
      }
      this.#send(socket, { type: 'ack', command_id: body.command_id ?? body.commandId ?? null });
      return;
    }

    this.#send(socket, { type: 'error', reason: 'unknown_message_type' });
  }

  #send(socket, payload) {
    socket.write(encodeFrame(payload));
  }
}
