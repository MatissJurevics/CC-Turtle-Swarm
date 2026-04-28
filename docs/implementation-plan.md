# Implementation Plan

This plan turns the architecture into executable slices. The project should advance in small commits where each commit leaves the repo coherent and updates validation coverage.

## High-Level Delivery Strategy

| Slice | Goal | Primary output | Validation gate |
| --- | --- | --- | --- |
| 0. Repo foundation | Make the project navigable and commit-backed | Docs, README, QA matrix, package scripts | `npm test`, doc review |
| 1. Control-plane kernel | Establish events, commands, leases, and projections | Dependency-light Node modules | Unit tests for event/command/lease behavior |
| 2. Turtle runtime MVP | Boot, observe, spool, heartbeat, wrapped safe actions | `startup.lua` and runtime modules | Lua syntax check plus in-game smoke test |
| 3. Gateway transport | Connect turtles to server with ack/replay | WebSocket gateway and turtle transport | Integration test with simulated turtle client |
| 4. Operator API | Expose safe HTTP/domain API for UI and MCP | API routes/services | Contract tests and audit log checks |
| 5. World model | Materialize observed blocks and position state | World projection and query API | Projection replay tests |
| 6. Script registry | Validate, store, approve, and run script bundles | Script package model and executor contract | Permission/limit tests |
| 7. Scheduler | Turn goals into jobs, leases, and commands | Job planner/scheduler modules | Planner unit tests and conflict tests |
| 8. Web UI | Provide operator console | Fleet, turtle, job, world, diagnostics views | Browser smoke tests and responsive screenshots |
| 9. MCP adapter | Let Codex operate through safe tools/resources | MCP server over domain API | Tool schema tests and mutation audit tests |
| 10. Factory | Provision turtles through explicit workflow | Factory job provider | Disabled-by-default and bay lease tests |

## Dependency Order

1. Event store, leases, and command queue.
2. Turtle heartbeat and telemetry.
3. WebSocket gateway with ack/replay.
4. Read-model projections.
5. Operator API.
6. Manual lease and atomic actions.
7. World model and path reservations.
8. Script registry and executor.
9. Scheduler.
10. Web UI.
11. MCP adapter.
12. Factory.

The dependency order keeps correctness primitives ahead of automation. Jobs, scripts, MCP, and factory provisioning all depend on trustworthy events, leases, and command state.

## Execution Rules

- Commit after each coherent feature or validation improvement.
- Every mutating feature gets tests for success, rejection, and recovery paths.
- Every component updates `docs/qa-validation-matrix.md` when its validation state changes.
- In-game setup must remain copy/pasteable for a single turtle.
- Dangerous capabilities stay disabled until their guardrails exist.

## Component Plans

### 1. Event Store

Purpose: append-only source of truth for turtle, command, job, world, script, and lease events.

Implementation steps:

1. Keep an in-memory event store for MVP tests.
2. Add aggregate sequencing and query helpers.
3. Add projection replay hooks.
4. Replace or back with SQLite/Postgres after domain contracts stabilize.

Acceptance criteria:

- Appends require event type and aggregate identity.
- Aggregate sequences are monotonic.
- Events can be queried by turtle and job.
- Projections can rebuild from `events.all()`.

Validation:

```text
npm test -- server/test/event-store.test.js
```

### 2. Lease Manager

Purpose: prevent conflicting control, path, inventory, and factory operations.

Implementation steps:

1. Implement TTL-based acquire/validate/release.
2. Add conflict responses.
3. Emit lease events from domain service.
4. Attach lease validation to mutating commands.

Acceptance criteria:

- Two holders cannot hold the same active lease.
- Same holder can renew.
- Expired leases can be replaced.
- Mutating commands fail without valid lease where required.

Validation:

```text
npm test -- server/test/leases.test.js
```

### 3. Command Queue

Purpose: reliably queue, dispatch, complete, cancel, and deduplicate turtle commands.

Implementation steps:

1. Implement idempotent enqueue.
2. Dispatch next command per turtle.
3. Honor TTL and cancellation.
4. Emit command lifecycle events.
5. Add dead-letter handling for repeated failure.

Acceptance criteria:

- Idempotency keys return the original command.
- Expired commands are not dispatched.
- Completion records success/failure result.
- Cancellation works before dispatch.

Validation:

```text
npm test -- server/test/commands.test.js
```

### 4. Turtle Runtime

Purpose: run on CC: Tweaked turtles as a supervised local actor.

Implementation steps:

1. Boot from `/startup.lua`.
2. Load `/fleet/config.lua`.
3. Emit boot and heartbeat events.
4. Persist local event spool.
5. Wrap turtle APIs with before/after observations.
6. Add WebSocket transport and ack replay.
7. Add command receive loop and watchdog.

Acceptance criteria:

- Missing config creates a safe default and stops.
- Runtime survives reboot and emits boot event.
- Heartbeat includes fuel, slot, inventory, version, label, and computer ID.
- Wrapped actions always emit started/completed events.
- Raw scripts cannot bypass wrappers in approved execution mode.

Validation:

```text
luac -p turtle/startup.lua turtle/runtime/*.lua
in-game smoke: boot -> heartbeat -> inspect
```

### 5. WebSocket Gateway

Purpose: receive turtle connections and exchange commands/events.

Implementation steps:

1. Add HTTP server.
2. Add WebSocket route `/turtle/ws`.
3. Authenticate pairing token.
4. Accept heartbeat and event spool uploads.
5. Send queued commands.
6. Ack received events.

Acceptance criteria:

- Unknown turtle or bad token is rejected.
- Heartbeats update turtle status.
- Events are appended once.
- Commands are delivered only to matching turtle.
- Reconnect replays unacked events without duplicate effects.

Validation:

```text
npm test -- server/test/gateway.test.js
```

### 6. World Model

Purpose: maintain a partial, confidence-aware digital twin from turtle observations.

Implementation steps:

1. Define cell identity: dimension, x, y, z.
2. Project inspect events into cells.
3. Track unknown, air, solid, liquid, entity, turtle.
4. Track confidence and stale timestamps.
5. Add reservation overlays for path planning.

Acceptance criteria:

- Never-observed cells read as unknown.
- Inspect success updates the target cell.
- Old observations remain visible as stale.
- Reservations block conflicting planners.

Validation:

```text
npm test -- server/test/world-model.test.js
```

### 7. Script Registry And Executor

Purpose: make scripts deployable, reviewable, permissioned, and revocable.

Implementation steps:

1. Define script manifest schema.
2. Hash source bundles.
3. Validate permissions and limits.
4. Store approved versions.
5. Run scripts through runtime wrapper API.
6. Capture stdout/stderr/errors/checkpoints.

Acceptance criteria:

- Invalid manifests are rejected.
- Hash mismatches are rejected.
- Unapproved permissions fail before deployment.
- Runtime limits stop scripts.
- Revoked scripts cannot start new runs.

Validation:

```text
npm test -- server/test/scripts.test.js
in-game smoke: deploy approved inspect-only script
```

### 8. Scheduler And Planner

Purpose: convert goals into safe job graphs and command batches.

Implementation steps:

1. Define job graph model.
2. Add turtle capability matching.
3. Add fuel/inventory/location scoring.
4. Add cell reservations.
5. Add blocked/failure states.
6. Add saga-style recovery actions.

Acceptance criteria:

- Offline turtles are not assigned.
- Low-fuel turtles are rejected or sent to refuel.
- Conflicting path reservations fail.
- Blocked jobs include actionable reasons.

Validation:

```text
npm test -- server/test/scheduler.test.js
```

### 9. Operator Web UI

Purpose: make fleet state, failures, and manual control visible.

Implementation steps:

1. Add fleet dashboard.
2. Add turtle detail page.
3. Add command queue and lease controls.
4. Add job board.
5. Add world view.
6. Add diagnostics.

Acceptance criteria:

- Manual controls are disabled without a lease.
- Online/offline/busy/lost states are clear.
- Unknown/known/stale world cells are visually distinct.
- Recent errors are reachable from dashboard and turtle detail.

Validation:

```text
npm test
browser smoke on desktop and mobile viewport
```

### 10. MCP Adapter

Purpose: expose safe tools and resources to Codex or other MCP clients.

Implementation steps:

1. Add read-only resources first.
2. Add diagnostics tools.
3. Add planning tools.
4. Add guarded mutating tools.
5. Add audit events for every tool call.

Acceptance criteria:

- Resource reads do not mutate state.
- Tool inputs are schema-validated.
- Mutating tools require permission and confirmation.
- Every tool call produces an audit event.

Validation:

```text
npm test -- server/test/mcp.test.js
```

### 11. Factory

Purpose: create/provision turtles through explicit, auditable workflows.

Implementation steps:

1. Keep factory disabled by default.
2. Define survival and admin providers.
3. Reserve provisioning bay.
4. Verify materials or privilege.
5. Place/power/bootstrap/pair turtle.
6. Deploy role script.
7. Move turtle out of bay.

Acceptance criteria:

- Factory requests fail while disabled.
- One bay cannot run two provisioning jobs.
- Failed provisioning releases leases.
- New turtles join normal fleet protocol.

Validation:

```text
npm test -- server/test/factory.test.js
in-game smoke: provision one turtle in dedicated bay
```

