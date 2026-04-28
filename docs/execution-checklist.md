# Full Execution Checklist

This checklist is the working contract for implementing the initial architecture spec. Each item must land with code, tests or an explicit manual validation path, and a commit.

## 0. Foundation

- [x] Initialize git repository.
- [x] Add architecture spec.
- [x] Add implementation plan.
- [x] Add QA validation matrix.
- [x] Add in-game setup guide.
- [x] Add repeatable validation command.
- [x] Keep `npm run validate` passing after every feature.

## 1. Control Plane Kernel

- [x] Event store with aggregate sequencing.
- [x] Lease manager with TTL/conflict validation.
- [x] Command queue with idempotency, dispatch, completion, and cancel.
- [x] Domain service that emits lifecycle events for leases and commands.
- [x] Turtle read model projection.
- [x] Job read model projection.
- [x] World model projection.
- [x] Diagnostics query helpers.

## 2. Turtle Runtime

- [x] `/startup.lua` bootloader.
- [x] Config loader.
- [x] Local structured logger.
- [x] Local event spool.
- [x] Wrapped action API scaffold.
- [x] WebSocket transport with reconnect/backoff.
- [x] Event ack and replay.
- [x] Command receive loop.
- [x] Action lease/precondition enforcement.
- [x] Watchdog and cooperative stop.
- [x] Restricted script execution environment.
- [ ] In-game smoke procedure for boot, heartbeat, inspect.

## 3. Gateway Transport

- [x] HTTP server foundation.
- [x] WebSocket route `/turtle/ws`.
- [x] Pairing-token authentication.
- [x] Heartbeat ingestion.
- [x] Event ingestion and ack.
- [x] Command dispatch to connected turtles.
- [x] Reconnect replay test with simulated turtle.

## 4. Operator API

- [x] `GET /api/fleet`.
- [x] `GET /api/turtles/:id`.
- [x] `GET /api/turtles/:id/inventory`.
- [x] `GET /api/turtles/:id/logs`.
- [x] `GET /api/jobs`.
- [x] `POST /api/jobs`.
- [x] `POST /api/jobs/:id/cancel`.
- [x] `POST /api/leases`.
- [x] `POST /api/turtles/:id/actions`.
- [x] `GET /api/world`.
- [x] Audit event for every mutating request.

## 5. World Model

- [x] Cell identity by dimension/x/y/z.
- [x] Unknown/air/solid/liquid/entity/turtle occupancy.
- [x] Confidence and `last_seen_at`.
- [x] Inspection event projection.
- [x] Reservation overlay for path planning.
- [x] Query by bounding box.

## 6. Script Registry

- [x] Manifest schema validation.
- [x] Source bundle hashing.
- [x] Permission validation.
- [x] Approval/revocation state.
- [x] Runtime limit model.
- [x] Executor contract for turtle runtime.
- [x] Tests for invalid manifest, hash mismatch, permission denial, revocation.

## 7. Scheduler And Jobs

- [x] Job model and lifecycle.
- [x] Goal-to-plan scaffold.
- [x] Turtle capability matching.
- [x] Fuel/inventory/location scoring.
- [ ] Cell reservations.
- [x] Blocked-state reasons.
- [ ] Saga-style recovery hooks.

## 8. MCP Adapter

- [x] Resource definitions for fleet/turtle/job/world/script/errors.
- [x] Tool schemas for safe read tools.
- [x] Tool schemas for guarded mutating tools.
- [x] Input validation.
- [x] Audit events for tool calls.
- [x] Confirmation-required metadata for dangerous tools.

## 9. Operator Web UI

- [x] Fleet dashboard.
- [x] Turtle detail.
- [x] Manual control pad with lease status.
- [x] Job board.
- [x] World cell query/debug view.
- [x] Script registry view.
- [x] Diagnostics view.
- [x] Responsive layout smoke test.

## 10. Factory

- [x] Disabled-by-default factory service.
- [ ] Survival provider contract.
- [ ] Admin provider contract.
- [x] Factory bay lease.
- [ ] Material/permission checks.
- [x] Provisioning workflow state machine.
- [ ] Failure cleanup.

## 11. Validation

- [x] Node unit tests for event store, leases, commands, control-plane composition.
- [x] Node unit tests for projections and world model.
- [x] Node unit tests for scripts, scheduler, factory.
- [x] Node unit tests for MCP.
- [x] HTTP API integration tests.
- [x] WebSocket gateway integration tests.
- [x] Static UI smoke test.
- [x] Lua syntax validation when `luac` or `nix-shell -p lua` is available.
- [ ] Manual CC: Tweaked smoke test checklist.
