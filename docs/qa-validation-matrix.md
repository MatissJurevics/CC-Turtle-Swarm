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
| Missing config | Manual emulator/in-game | Turtle creates or prompts for config without crashing | Not started |
| Valid config | Manual emulator/in-game | Runtime starts with configured `turtle_id` and URL | Not started |
| Bad URL | Manual emulator/in-game | Retry loop with backoff and structured error | Not started |
| Runtime version check | Unit/manual | Newer runtime is detected before supervisor start | Not started |
| Reboot recovery | In-game | Turtle reconnects and reports reboot event | Not started |

## Turtle Transport

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| WebSocket connect | Integration | Turtle connects outbound to gateway | Not started |
| Heartbeat | Integration | Heartbeat event appears at configured interval | Not started |
| Server disconnect | Integration | Turtle reconnects with exponential backoff | Not started |
| Event ack | Integration | Acked events are removed from local spool | Not started |
| Replay after reconnect | Integration | Unacked events replay once without duplication | Not started |
| Malformed command | Integration | Command is rejected and logged | Not started |

## Turtle Runtime Action Wrapper

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Inspect front | In-game | Completion event includes observation | Not started |
| Forward success | In-game | Position updates after successful movement | Not started |
| Forward blocked | In-game | Position unchanged and reason is logged | Not started |
| Fuel guard | In-game | Movement rejected before zero-fuel failure | Not started |
| Lease guard | Integration | Mutating action without lease is rejected | Not started |
| Timeout | Unit/integration | Long action is cancelled or marked timed out | Not started |

## Odometry And GPS

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Turn tracking | Unit/in-game | Facing updates after successful turns | Not started |
| Move tracking | Unit/in-game | Coordinates update only on success | Not started |
| Failed move | Unit/in-game | Coordinates do not drift | Not started |
| GPS reconcile | In-game | Position corrects when GPS is available | Not started |
| GPS unavailable | In-game | Runtime continues with degraded confidence | Not started |

## Event Store

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Append event | Unit | Event persists with aggregate and sequence | Not started |
| Duplicate idempotency key | Unit | Duplicate command does not duplicate effects | Not started |
| Read by turtle | Unit | Events filter by turtle ID | Not started |
| Read by job | Unit | Events filter by job ID | Not started |
| Replay projection | Unit | Read models rebuild from event history | Not started |

## Command Queue

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Enqueue command | Unit | Command starts as queued | Not started |
| Dispatch command | Integration | Online turtle receives next command | Not started |
| Command TTL | Unit/integration | Expired command is not executed | Not started |
| Cancel queued | Integration | Queued command becomes cancelled | Not started |
| Clear queue | Integration | Turtle receives no cleared commands | Not started |

## World Model

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Unknown cell | Unit | Never-observed cell reads as unknown | Not started |
| Known air | Unit/in-game | Empty inspected cell records air | Not started |
| Known solid | Unit/in-game | Block inspected as solid with block name | Not started |
| Stale observation | Unit | Old cells expose `last_seen_at` and confidence | Not started |
| Reservation | Unit | Reserved cell blocks conflicting path plan | Not started |

## Planner And Scheduler

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Capability match | Unit | Mining job selects mining-capable turtle | Not started |
| Fuel check | Unit | Low-fuel turtle is rejected or sent to refuel | Not started |
| Offline turtle | Unit | Offline turtle is not assigned | Not started |
| Collision reservation | Unit | Two turtles do not reserve same corridor | Not started |
| Blocked job | Integration | Scheduler marks blocked with reason | Not started |

## Script Registry And Executor

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Manifest parse | Unit | Valid script package loads permissions/limits | Not started |
| Hash check | Unit | Source bundle hash matches manifest | Not started |
| Permission denied | Unit/in-game | Script cannot call unapproved runtime action | Not started |
| Runtime limit | Unit/in-game | Script stops after max runtime | Not started |
| Error capture | Unit/in-game | Stack trace appears in event/log stream | Not started |
| Checkpoint resume | Integration | Script resumes from last checkpoint when allowed | Not started |

## MCP Server

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| List resources | Integration | Fleet, turtle, job, world resources are exposed | Not started |
| Read-only resource | Integration | Resource reads never mutate state | Not started |
| Tool validation | Unit/integration | Invalid arguments are rejected before enqueue | Not started |
| Mutating confirmation | Manual/integration | Dangerous tools require explicit approval | Not started |
| Audit log | Integration | Every tool call has an audit event | Not started |
| Rate limit | Integration | Manual action spam is throttled | Not started |

## Web UI

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Fleet dashboard | Manual/browser | Turtles show status, fuel, version, active job | Not started |
| Turtle detail | Manual/browser | Inventory, logs, and current command render | Not started |
| Manual lease UI | Manual/browser | Controls disabled without lease | Not started |
| World view states | Manual/browser | Unknown, known, and stale cells are distinct | Not started |
| Error visibility | Manual/browser | Recent failures are discoverable | Not started |
| Mobile/desktop layout | Manual/browser | Operator-critical text does not overlap | Not started |

## Factory Provisioning

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Factory disabled default | Unit/manual | Factory tools reject requests until enabled | Not started |
| Resource check | Integration/in-game | Survival factory verifies materials first | Not started |
| Bay lease | Integration | Only one provisioning job uses a bay | Not started |
| Pairing | Integration/in-game | New turtle receives ID and heartbeat | Not started |
| Role deployment | Integration/in-game | New turtle gets approved role script | Not started |
| Failure cleanup | Integration/in-game | Failed provisioning releases bay and reports reason | Not started |

## Security And Operations

| Test | Method | Expected result | Status |
| --- | --- | --- | --- |
| Per-turtle credential | Integration | Unknown turtle cannot pair | Not started |
| Script revocation | Integration | Revoked script cannot start new runs | Not started |
| Rednet ignored | In-game | Unsigned rednet command has no effect | Not started |
| Runtime drift | Integration | Old runtime version appears in warnings | Not started |
| Quarantine | Integration | Repeated crashes quarantine turtle | Not started |
| Backup/restore | Manual | Event store can be backed up and restored | Not started |

