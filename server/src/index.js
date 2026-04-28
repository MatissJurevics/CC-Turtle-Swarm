import { EventStore } from './event-store.js';
import { LeaseManager } from './leases.js';
import { CommandQueue } from './commands.js';
import { buildReadModels } from './projections.js';
import { ScriptRegistry } from './scripts.js';
import { Scheduler } from './scheduler.js';
import { FactoryService } from './factory.js';
import { ControlPlaneDomain } from './domain.js';

export function createControlPlane() {
  const events = new EventStore();
  const leases = new LeaseManager();
  const commands = new CommandQueue();
  const scripts = new ScriptRegistry();
  const scheduler = new Scheduler();
  const factory = new FactoryService({ leases, events });
  const domain = new ControlPlaneDomain({ events, leases, commands, scripts, scheduler, factory });

  return {
    events,
    leases,
    commands,
    scripts,
    scheduler,
    factory,
    domain,
    readModels() {
      return buildReadModels(events);
    },
    recordHeartbeat(turtleId, payload = {}) {
      return events.append({
        type: 'event.turtle.heartbeat',
        aggregateType: 'turtle',
        aggregateId: turtleId,
        turtleId,
        payload
      });
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const plane = createControlPlane();
  console.log(JSON.stringify({
    status: 'ok',
    service: 'computercraft-turtle-fleet',
    components: Object.keys(plane)
  }));
}
