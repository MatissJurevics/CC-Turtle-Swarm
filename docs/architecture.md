# Autonomous ComputerCraft Turtle Fleet Architecture

Target platform: CC: Tweaked or modern ComputerCraft.

The core design principle is that turtles are not dumb remote terminals. Each turtle is a small supervised actor that can execute safe atomic actions, run approved scripts, report telemetry, and recover locally when the server or chunk loading fails. The external service is the control plane, event log, planner, script registry, and visualization source, but correctness must not depend on the server being continuously online.

## System Shape

```text
                         Human / Codex / other MCP client
                                      |
                                  MCP Server
                         tools / resources / prompts
                                      |
Web UI  <---- Read API / Event Stream ---->  Control Plane API
                                      |
             -----------------------------------------------------
             |                |                 |                 |
       Fleet Gateway     Scheduler/Planner   Script Registry   World Model
       WebSocket/HTTP    Jobs + leases       Versions/hashes    Digital twin
             |                |                 |                 |
             ------------------- Command/Event Bus ----------------
                                      |
                                Event Store DB
                                      |
                              Turtle WebSocket Gateway
                                      |
                        Turtle Runtime / Supervisor
               bootloader, action wrapper, logger, script runner
```

The MCP server is an adapter over the same domain API used by the web UI. It must not bypass validation, leases, rate limits, logging, or safety gates.

GPS turtles should be treated as infrastructure hosts, not normal workers. Turtle reproduction should be modeled as a factory/provisioning subsystem, not as an unconstrained worker behavior.

## Key Constraints

Turtles can move, turn, dig, place, attack, suck and drop items, craft, inspect adjacent blocks, read inventory, refuel, and use equipped upgrades. They cannot generally perform arbitrary player UI interactions unless that capability is explicitly built through peripherals, command computers, or mod integrations.

Many turtle API calls return success or failure plus a reason. The runtime should preserve those reasons as structured events.

Chunk loading is a deployment dependency. If chunks unload, programs may stop and later restart. The system must make chunk-loading assumptions visible in the UI and in diagnostics.

## Design Patterns

- Actor model and supervision: each turtle has a mailbox, local state, and a supervisor. Failure handling belongs in the supervisor instead of mission logic.
- Event sourcing: every meaningful state change is appended as an event.
- CQRS: commands mutate state through validators and queues, while the UI and MCP resources read materialized views.
- Saga-style recovery: long-running jobs use compensating actions such as releasing leases, returning to dock, marking cells unknown, or requesting intervention.
- Sense-plan-act loop: turtles sense local state, the server updates the world model, the planner creates work, the scheduler allocates turtles, and executors act continuously.

## Transport

Use outbound WebSockets from turtles to the turtle gateway as the primary transport. This matches the CC: Tweaked HTTP/WebSocket model better than trying to make turtles accept inbound connections.

Rednet may be used as an optional in-game fallback or relay, but not as the primary secure control channel. Rednet has no security guarantees and should be treated as spoofable unless messages are encrypted or signed.

For development, ComputerCraft local and private IP access may require configuration changes. Local development success must not be confused with a safe public deployment. Use TLS or WSS, per-turtle credentials, and server-side access control when exposed outside a trusted network.

## Turtle Runtime

Every turtle runs a small `startup.lua` bootloader:

1. Load config: `turtle_id`, pairing token, fleet URL, runtime version.
2. Connect to the server.
3. Check whether a newer runtime exists.
4. Download runtime by hash or version.
5. Start the supervisor.
6. Reconnect forever with backoff.
7. Never accept unsigned arbitrary code from rednet or public chat.

Runtime modules:

| Module | Responsibility |
| --- | --- |
| `boot` | Version check, runtime download, pairing, config migration. |
| `transport` | WebSocket connect/reconnect, send queue, receive queue, ack tracking. |
| `identity` | Computer ID, label, turtle ID, hardware capabilities, equipped upgrades. |
| `observer` | Fuel, selected slot, inventory, equipped items, position, facing, local observations. |
| `actuator` | Wrapped turtle API: movement, turn, dig, place, attack, suck/drop, refuel, craft. |
| `odometry` | Tracks position/facing after successful moves and periodically reconciles with GPS. |
| `scanner` | `inspect`, `inspectUp`, `inspectDown`, and optional sweep or volume scan tasks. |
| `executor` | Runs approved scripts in a restricted environment using wrapped APIs. |
| `watchdog` | Cooperative cancel, timeout checks, panic stop, reboot recovery. |
| `logger` | Structured logs, stdout/stderr capture, error reports, local event spool. |

All turtle actions must go through wrapped runtime APIs. Scripts should call `rt.forward()` or equivalent, not raw `turtle.forward()`, so the runtime can log before and after state, enforce fuel and lease checks, update odometry, and emit failure reasons.

## Script Model

Scripts are packages, not loose strings:

```text
script_id: "sha256:..."
name: "strip_mine_v3"
version: "3.1.0"
entrypoint: "main.lua"
permissions:
  - turtle.move
  - turtle.dig
  - inventory.drop
limits:
  max_runtime_s: 900
  max_blocks_changed: 500
  max_distance_from_origin: 128
checkpoint_policy: every_10_actions
```

Run scripts under a restricted Lua environment where `http`, `rednet`, `shell`, `fs`, and `os` are removed or wrapped. This is defense in depth, not a perfect sandbox. The stronger boundary is review, hashes, signatures, permissions, deployment records, logs, and revocation.

## Command Protocol

Messages are idempotent, ordered, and acknowledged.

```json
{
  "v": 1,
  "type": "command.request",
  "msg_id": "01J...",
  "turtle_id": "turtle-017",
  "job_id": "job-abc",
  "command_id": "cmd-xyz",
  "seq": 1842,
  "sent_at": "2026-04-28T12:00:00Z",
  "body": {}
}
```

Atomic action command:

```json
{
  "type": "command.request",
  "body": {
    "kind": "turtle.action",
    "action": "forward",
    "args": [],
    "mode": "manual",
    "lease_id": "lease-123",
    "preconditions": {
      "expected_position": [100, 64, -20],
      "expected_facing": "north",
      "min_fuel": 1,
      "must_hold_lease": true
    },
    "timeout_ms": 5000,
    "idempotency_key": "manual-017-00042"
  }
}
```

Completion event:

```json
{
  "type": "event.action.completed",
  "body": {
    "command_id": "cmd-xyz",
    "success": false,
    "error": {
      "code": "blocked",
      "message": "Movement obstructed"
    },
    "before": {
      "position": [100, 64, -20],
      "facing": "north",
      "fuel": 399
    },
    "after": {
      "position": [100, 64, -20],
      "facing": "north",
      "fuel": 399
    },
    "observations": [
      {
        "direction": "front",
        "block": {
          "name": "minecraft:stone",
          "state": {}
        }
      }
    ],
    "duration_ms": 73
  }
}
```

The server must not assume an action happened until it receives a completion event. The turtle persists outbound events locally and replays unacknowledged events after reconnect.

## Event Store And Read Models

Append-only source of truth:

```text
events
- event_id
- aggregate_type        turtle | job | world_cell | script | lease
- aggregate_id
- event_type
- seq
- causation_id
- correlation_id
- job_id
- turtle_id
- payload_json
- created_at
```

Materialized read models:

```text
turtles
- turtle_id
- computer_id
- label
- status              online | offline | busy | paused | lost | quarantined
- position
- facing
- dimension
- fuel
- selected_slot
- runtime_version
- last_heartbeat_at
- active_job_id

turtle_inventory_slots
- turtle_id
- slot
- item_name
- count
- nbt_hash
- detail_json
- observed_at

jobs
- job_id
- goal_text
- status              planned | running | blocked | failed | succeeded | cancelled
- priority
- created_by
- plan_json
- created_at
- updated_at

commands
- command_id
- turtle_id
- job_id
- status              queued | sent | running | succeeded | failed | cancelled
- command_json
- result_json
- created_at
- completed_at

world_cells
- dimension
- x
- y
- z
- block_name
- state_json
- tags_json
- occupancy           unknown | air | solid | liquid | entity | turtle
- confidence
- last_seen_by
- last_seen_at
- reserved_by_job_id
- reserved_until

scripts
- script_id
- name
- version
- sha256
- permissions_json
- source_bundle
- created_by
- approved_by
- created_at
```

The world model must distinguish unknown, known air, known solid, and stale observations. A turtle's view is partial and may be wrong after blocks change.

## Planner, Scheduler, And Leases

The planner converts goals into job graphs:

```text
Goal: "Mine a 16x16 area down to y=20"
  -> Survey boundary
  -> Reserve work volume
  -> Assign dig lanes
  -> Assign hauler turtle
  -> Monitor fuel/inventory
  -> Deposit items
  -> Mark volume complete
```

The scheduler selects turtles by capability, location, health, current state, and risk.

Use leases for anything that can conflict:

```text
lease types
- turtle_control: one agent/user controls a turtle manually
- cell_reservation: a path or work volume
- inventory_resource: chest slot, depot, fuel source
- factory_slot: turtle creation/provisioning station
```

Every lease has a TTL. If a turtle disconnects, the lease remains briefly, then expires or enters recovery.

Pathfinding starts with A* over known or assumed-safe cells. Cell reservations prevent two turtles from planning through the same corridor at the same time. Unknown cells have tunable cost: scouts may enter them, haulers should avoid them.

## MCP Server

MCP exposes safe tools, rich resources, and task-specific prompts. It wraps the domain API rather than talking directly to turtles.

Resources:

```text
fleet://overview
turtle://{turtle_id}/state
turtle://{turtle_id}/inventory
turtle://{turtle_id}/logs?since=...
turtle://{turtle_id}/capabilities
job://{job_id}
job://{job_id}/events
world://{dimension}/{x}/{y}/{z}
world://query?bbox=...
script://{script_id}
errors://recent?severity=error
```

Tools:

| Tool | Mutates world? | Description |
| --- | ---: | --- |
| `fleet.list_turtles` | No | Return turtles, status, capabilities, location. |
| `fleet.get_turtle_state` | No | Full current materialized state for one turtle. |
| `world.query_cells` | No | Read known world cells in a volume. |
| `logs.search` | No | Search logs/events by job/turtle/error. |
| `jobs.plan` | No | Produce a proposed plan without execution. |
| `jobs.create` | Yes | Create a job from a goal and constraints. |
| `jobs.assign` | Yes | Allocate turtles and enqueue work. |
| `jobs.cancel` | Yes | Cancel job, release leases, tell turtles to stop. |
| `leases.acquire` | Yes | Acquire manual or work-volume lease. |
| `turtle.action` | Yes | Execute one atomic turtle action under a lease. |
| `turtle.batch_actions` | Yes | Execute bounded sequence with preconditions. |
| `scripts.validate` | No | Static checks and simulator checks. |
| `scripts.deploy` | Yes | Store approved script version for turtles. |
| `scripts.run` | Yes | Run script on selected turtles. |
| `factory.create_turtle` | Yes | Create/provision a turtle through the factory workflow. |
| `diagnostics.explain_failure` | No | Summarize likely cause and next repair action. |

Do not expose raw "run arbitrary Lua now" as an MCP tool. Use validate, deploy, and run workflows with permissions, limits, audit logs, and human confirmation for dangerous operations.

## Web UI

The web UI is an operator console with these main views:

- Fleet dashboard: online/offline/busy/lost turtles, fuel and inventory warnings, runtime drift, active jobs, recent errors.
- World view: 3D voxel map, unknown/known/stale blocks, turtle positions and facing, reserved cells, job volumes, paths, source filters.
- Turtle detail: live state, inventory grid, upgrades, current job/script, action history, live logs, manual control pad with lease status.
- Job board: goal text, plan graph, assigned turtles, progress, errors, cancel/pause/resume.
- Script registry: versions, hashes, permissions, test results, deployment status.
- Diagnostics: failed commands, stack traces, replay/export workflows, Codex-ready context.

Manual controls require an exclusive lease and must show the queued command list. Include clear queue, stop, and return-to-dock controls.

## Factory Subsystem

Creating turtles is a factory job.

Survival-compatible factory: a turtle or control computer uses stored resources, crafting, placement, adjacent computer control, and a bootstrap disk or provisioning station.

Admin/creative factory: a command computer may spawn or configure turtles, but this is a privileged provider that is disabled by default and never exposed directly to MCP agents.

Factory workflow:

```text
factory.create_turtle(role="miner", script="miner-v3")
  -> verify materials or admin permission
  -> reserve factory bay
  -> craft or spawn turtle item
  -> place turtle at provisioning position
  -> power/reboot turtle
  -> bootstrap runtime
  -> pair turtle with server
  -> assign turtle_id and label
  -> verify heartbeat
  -> deploy role script
  -> move turtle out of bay
  -> mark ready
```

The result is a normal registered turtle that joins the same fleet protocol.

## Safety And Reliability

Security requirements:

```text
- Per-turtle credentials.
- TLS/WSS when not purely local.
- Signed or hashed script bundles.
- No unsigned rednet commands.
- MCP mutating tools require user confirmation.
- Role-based permissions for web UI and MCP.
- Rate limits on manual action tools.
- Audit log for every tool call and command.
- Dangerous tools disabled by default: command computer, arbitrary Lua, mass dig/place.
```

Reliability requirements:

```text
- Heartbeat every N seconds.
- Reconnect with exponential backoff.
- Local event spool with ack/replay.
- Per-turtle monotonically increasing sequence numbers.
- Idempotency keys for commands.
- Command TTLs.
- Server-side dead-letter queue for failed jobs.
- Turtle quarantine after repeated crashes.
- Runtime version health checks.
- Chunk-loading assumptions visible in UI.
```

## MVP Plan

Phase 1: single turtle, trustworthy logs.

```text
- startup.lua bootloader
- WebSocket connection
- heartbeat
- wrapped movement/dig/place/inspect
- event store
- simple web UI turtle detail
```

Phase 2: command queues and manual control.

```text
- per-turtle command queue
- ack/retry/idempotency
- manual lease
- command history
- clear queue / pause / resume / reboot
```

Phase 3: world model.

```text
- position/facing/odometry
- GPS calibration
- inspect logging
- world_cells table
- 3D UI with unknown/stale states
```

Phase 4: script registry and supervised execution.

```text
- script bundle upload
- validation
- permission manifest
- controlled runtime API
- stdout/stderr/error capture
- checkpoints
```

Phase 5: fleet scheduler.

```text
- jobs
- turtle selection
- path reservations
- collision avoidance
- job lifecycle
- depot/fuel handling
```

Phase 6: MCP and Codex.

```text
- read-only MCP resources first
- diagnostics tools
- planning tools
- guarded mutating tools
- Codex skill for ComputerCraft fleet ops
```

Phase 7: factory/reproduction.

```text
- factory bay
- resource checks
- provisioning station
- bootstrap verification
- create_turtle MCP tool with strict confirmation
```

## Architectural Rule

Make the system event-first, lease-controlled, and observable.

The agent should not drive turtles blindly. It should read fleet, world, and log resources; propose a plan; acquire leases; enqueue jobs or scripts; watch structured events; and repair failures from the logs. Every action, state change, observation, and error should be preserved.

