# QA Validation Matrix

Use this matrix as the acceptance checklist for each component. A component is not done until its happy path, failure path, recovery behavior, observability, and safety controls have been validated.

## Status Legend

```text
Not started
Manual only
Automated
Blocked
Passed
Failed
```

## Turtle Bootloader

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| One-paste installer | Integration/manual | `wget run` installer writes startup, runtime, config, and reboots | Automated |
| Served runtime files | Integration | Installer and runtime Lua files are available from the control plane | Automated |
| Missing config | Manual emulator/in-game | Turtle creates or prompts for config without crashing | Manual only |
| Valid config | Manual emulator/in-game | Runtime starts with configured `turtle_id` and URL | Manual only |
| Bad URL | Manual emulator/in-game | Retry loop with backoff and structured error | Manual only |
| Runtime version check | Unit/manual | Runtime version is reported in telemetry | Automated |
| Reboot recovery | In-game | Turtle reconnects and reports reboot event | Manual only |

## Turtle Transport

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| WebSocket connect | Integration | Turtle connects outbound to gateway | Automated |
| Heartbeat | Integration | Heartbeat event appears at configured interval | Automated |
| Server disconnect | Integration | Turtle reconnects with exponential backoff | Manual only |
| Event ack | Integration | Acked events are removed from local spool | Automated |
| Replay after reconnect | Integration | Unacked events replay once without duplication | Automated |
| Malformed command | Integration | Command is rejected and logged | Automated |

## Turtle Runtime Action Wrapper

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Inspect front | In-game | Completion event includes observation | Manual only |
| Forward success | In-game | Position updates after successful movement | Manual only |
| Forward blocked | In-game | Position unchanged and reason is logged | Manual only |
| Fuel guard | In-game | Movement rejected before zero-fuel failure | Manual only |
| Lease guard | Integration | Mutating action without lease is rejected | Automated |
| Timeout | Unit/integration | Long action is cancelled or marked timed out | Automated |

## Odometry And GPS

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Turn tracking | Unit/in-game | Facing updates after successful turns | Manual only |
| Move tracking | Unit/in-game | Coordinates update only on success | Manual only |
| Failed move | Unit/in-game | Coordinates do not drift | Manual only |
| GPS reconcile | In-game | Position corrects when GPS is available | Manual only |
| GPS unavailable | In-game | Runtime continues with degraded confidence | Manual only |

## Event Store

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Append event | Unit | Event persists with aggregate and sequence | Automated |
| Duplicate idempotency key | Unit | Duplicate command does not duplicate effects | Automated |
| Read by turtle | Unit | Events filter by turtle ID | Automated |
| Read by job | Unit | Events filter by job ID | Automated |
| Replay projection | Unit | Read models rebuild from event history | Automated |

## Command Queue

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Enqueue command | Unit | Command starts as queued | Automated |
| Dispatch command | Integration | Online turtle receives next command | Automated |
| Command TTL | Unit/integration | Expired command is not executed | Automated |
| Cancel queued | Integration | Queued command becomes cancelled | Automated |
| Clear queue | Integration | Turtle receives no cleared commands | Automated |

## World Model

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Unknown cell | Unit | Never-observed cell reads as unknown | Automated |
| Known air | Unit/in-game | Empty inspected cell records air | Automated |
| Known solid | Unit/in-game | Block inspected as solid with block name | Automated |
| Continuous scan projection | Unit/in-game | Turtle scan events update all observed adjacent cells | Automated |
| Stale observation | Unit | Old cells expose `last_seen_at` and confidence | Automated |
| Reservation | Unit | Reserved cell blocks conflicting path plan | Automated |

## Planner And Scheduler

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Capability match | Unit | Mining job selects mining-capable turtle | Automated |
| Fuel check | Unit | Low-fuel turtle is rejected or sent to refuel | Automated |
| Offline turtle | Unit | Offline turtle is not assigned | Automated |
| Collision reservation | Unit | Two turtles do not reserve same corridor | Automated |
| Blocked job | Integration | Scheduler marks blocked with reason | Automated |

## Script Registry And Executor

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Manifest parse | Unit | Valid script package loads permissions/limits | Automated |
| Hash check | Unit | Source bundle hash matches manifest | Automated |
| Permission denied | Unit/in-game | Script cannot call unapproved runtime action | Automated |
| Runtime limit | Unit/in-game | Runtime limit is represented in script manifest | Automated |
| Error capture | Unit/in-game | Stack trace appears in event/log stream | Manual only |
| Checkpoint resume | Integration | Script resumes from last checkpoint when allowed | Manual only |

## MCP Server

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| List resources | Integration | Fleet, turtle, job, world resources are exposed | Automated |
| Read-only resource | Integration | Resource reads never mutate state | Automated |
| Tool validation | Unit/integration | Invalid arguments are rejected before enqueue | Automated |
| Mutating confirmation | Manual/integration | Dangerous tools require explicit approval | Automated |
| Audit log | Integration | Every tool call has an audit event | Automated |
| Rate limit | Integration | Manual action spam is throttled | Automated |

## Web UI

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Fleet dashboard | Manual/browser | Turtles show status, fuel, version, active job | Passed |
| Turtle detail | Manual/browser | Inventory, logs, and current command render | Passed |
| Manual lease UI | Manual/browser | Controls disabled without lease | Passed |
| World view states | Manual/browser | Unknown, known, and stale cells are distinct | Passed |
| 3D area tab | Browser/integration | Console exposes a separate 3D Area tab backed by the world API | Automated |
| Multi-turtle fit | Manual/browser | Selected turtles and nearby scanned cells fit into the view together | Passed |
| Turtle hover details | Manual/browser | Hovering a rendered turtle shows status, position, fuel, job, runtime, and last scan | Passed |
| Error visibility | Manual/browser | Recent failures are discoverable | Passed |
| Turtle setup command | Browser/integration | Console renders copyable `wget run` command with current host and token | Automated |
| Mobile/desktop layout | Manual/browser | Operator-critical text does not overlap | Passed |

## Factory Provisioning

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Factory disabled default | Unit/manual | Factory tools reject requests until enabled | Automated |
| Resource check | Integration/in-game | Survival factory verifies materials first | Automated |
| Bay lease | Integration | Only one provisioning job uses a bay | Automated |
| Pairing | Integration/in-game | New turtle receives ID and heartbeat | Manual only |
| Role deployment | Integration/in-game | New turtle gets approved role script | Manual only |
| Failure cleanup | Integration/in-game | Failed provisioning releases bay and reports reason | Automated |

## Security And Operations

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Per-turtle credential | Integration | Unknown turtle cannot pair | Automated |
| Script revocation | Integration | Revoked script cannot start new runs | Automated |
| Rednet ignored | In-game | Unsigned rednet command has no effect | Manual only |
| Runtime drift | Integration | Old runtime version appears in warnings | Manual only |
| Quarantine | Integration | Repeated crashes quarantine turtle | Automated |
| Backup/restore | Manual | Event store can be backed up and restored | Manual only |
