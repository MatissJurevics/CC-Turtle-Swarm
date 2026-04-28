# Full Execution Checklist

This checklist is the working contract for implementing the initial architecture spec. Each item must land with code, tests or an explicit manual validation path, and a commit.

## 0. Foundation

- [x] Initialize git repository.
- [x] Add architecture spec.
- [x] Add implementation plan.
- [x] Add QA validation matrix.
- [x] Add in-game setup guide.
- [x] Add repeatable validation command.
- [ ] Keep `npm run validate` passing after every feature.

## 1. Control Plane Kernel

- [x] Event store with aggregate sequencing.
- [x] Lease manager with TTL/conflict validation.
- [x] Command queue with idempotency, dispatch, completion, and cancel.
- [ ] Domain service that emits lifecycle events for leases and commands.
- [ ] Turtle read model projection.
- [ ] Job read model projection.
- [ ] World model projection.
- [ ] Diagnostics query helpers.

## 2. Turtle Runtime

- [x] `/startup.lua` bootloader.
- [x] Config loader.
- [x] Local structured logger.
- [x] Local event spool.
- [x] Wrapped action API scaffold.
- [ ] WebSocket transport with reconnect/backoff.
- [ ] Event ack and replay.
- [ ] Command receive loop.
- [ ] Action lease/precondition enforcement.
- [ ] Watchdog and cooperative stop.
- [ ] Restricted script execution environment.
- [ ] In-game smoke procedure for boot, heartbeat, inspect.

## 3. Gateway Transport

- [ ] HTTP server foundation.
- [ ] WebSocket route `/turtle/ws`.
- [ ] Pairing-token authentication.
- [ ] Heartbeat ingestion.
- [ ] Event ingestion and ack.
- [ ] Command dispatch to connected turtles.
- [ ] Reconnect replay test with simulated turtle.

## 4. Operator API

- [ ] `GET /api/fleet`.
- [ ] `GET /api/turtles/:id`.
- [ ] `GET /api/turtles/:id/inventory`.
- [ ] `GET /api/turtles/:id/logs`.
- [ ] `GET /api/jobs`.
- [ ] `POST /api/jobs`.
- [ ] `POST /api/jobs/:id/cancel`.
- [ ] `POST /api/leases`.
- [ ] `POST /api/turtles/:id/actions`.
- [ ] `GET /api/world`.
- [ ] Audit event for every mutating request.

## 5. World Model

- [ ] Cell identity by dimension/x/y/z.
- [ ] Unknown/air/solid/liquid/entity/turtle occupancy.
- [ ] Confidence and `last_seen_at`.
- [ ] Inspection event projection.
- [ ] Reservation overlay for path planning.
- [ ] Query by bounding box.

## 6. Script Registry

- [ ] Manifest schema validation.
- [ ] Source bundle hashing.
- [ ] Permission validation.
- [ ] Approval/revocation state.
- [ ] Runtime limit model.
- [ ] Executor contract for turtle runtime.
- [ ] Tests for invalid manifest, hash mismatch, permission denial, revocation.

## 7. Scheduler And Jobs

- [ ] Job model and lifecycle.
- [ ] Goal-to-plan scaffold.
- [ ] Turtle capability matching.
- [ ] Fuel/inventory/location scoring.
- [ ] Cell reservations.
- [ ] Blocked-state reasons.
- [ ] Saga-style recovery hooks.

## 8. MCP Adapter

- [ ] Resource definitions for fleet/turtle/job/world/script/errors.
- [ ] Tool schemas for safe read tools.
- [ ] Tool schemas for guarded mutating tools.
- [ ] Input validation.
- [ ] Audit events for tool calls.
- [ ] Confirmation-required metadata for dangerous tools.

## 9. Operator Web UI

- [ ] Fleet dashboard.
- [ ] Turtle detail.
- [ ] Manual control pad with lease status.
- [ ] Job board.
- [ ] World cell query/debug view.
- [ ] Script registry view.
- [ ] Diagnostics view.
- [ ] Responsive layout smoke test.

## 10. Factory

- [ ] Disabled-by-default factory service.
- [ ] Survival provider contract.
- [ ] Admin provider contract.
- [ ] Factory bay lease.
- [ ] Material/permission checks.
- [ ] Provisioning workflow state machine.
- [ ] Failure cleanup.

## 11. Validation

- [x] Node unit tests for event store, leases, commands, control-plane composition.
- [ ] Node unit tests for projections and world model.
- [ ] Node unit tests for scripts, scheduler, factory, MCP.
- [ ] HTTP API integration tests.
- [ ] WebSocket gateway integration tests.
- [ ] Static UI smoke test.
- [ ] Lua syntax validation when `luac` is available.
- [ ] Manual CC: Tweaked smoke test checklist.

