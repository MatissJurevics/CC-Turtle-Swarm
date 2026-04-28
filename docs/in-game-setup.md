# In-Game Setup Guide

This guide starts with one turtle and one local control-plane server. Add fleet scheduling, GPS, and factory provisioning only after the first turtle can connect, heartbeat, and run one safe action.

## 1. Server URL

Choose the URL turtles will call from inside Minecraft:

```text
ws://HOST:PORT/turtle/ws
```

For local development, `HOST` must be reachable from the Minecraft/CC: Tweaked environment. Depending on the modpack and server config, local or private IP access may be blocked until CC: Tweaked HTTP rules are updated.

Use `wss://` with real credentials outside a trusted local network.

## 2. CC: Tweaked HTTP Checklist

Verify the server config allows:

```text
- HTTP enabled.
- WebSocket access enabled.
- The control-plane host in the allow list.
- Local/private IPs allowed if developing against a LAN or host machine.
```

Restart the Minecraft server or client after config changes if required by the modpack.

## 3. Turtle Placement

For the first turtle:

```text
- Place the turtle in a loaded chunk.
- Add enough fuel for at least 20 movements.
- Keep the front block clear for safe movement tests.
- Give it a label so it survives item pickup/replacement flows.
```

Recommended first label:

```lua
os.setComputerLabel("fleet-dev-001")
```

## 4. Install Startup

Paste or upload `turtle/startup.lua` onto the turtle as `/startup.lua`.

Set config values when prompted, or create `/fleet/config.lua` manually:

```lua
return {
  turtle_id = "fleet-dev-001",
  fleet_url = "ws://HOST:PORT/turtle/ws",
  pairing_token = "dev-pairing-token",
  runtime_version = "0.1.0"
}
```

Reboot:

```lua
os.reboot()
```

## 5. Pairing Validation

The first successful pairing should produce:

```text
- Turtle appears online in the control plane.
- Heartbeat event is recorded.
- Fuel and inventory telemetry are visible.
- Runtime version is visible.
- Last error is empty.
```

Do not test digging or placement until heartbeat and read-only telemetry are stable.

## 6. First Safe Action

Acquire a manual lease, then run one bounded action:

```text
inspect front
```

Expected result:

```text
- command queued
- command started
- command completed
- observation event appended
- world cell updated or marked unknown/air/solid
```

Only after inspect works should movement be tested.

## 7. GPS Hosts

Treat GPS computers as infrastructure:

```text
- Place hosts at known coordinates.
- Keep their chunks loaded.
- Record their labels and coordinates in operator notes.
- Do not schedule them as normal worker turtles.
```

Runtime odometry should work without GPS but reconcile position when GPS is available.

## 8. Factory Setup

Factory/reproduction starts disabled. Enable it only after:

```text
- Manual turtle pairing works.
- Script deployment works.
- Leases work.
- A provisioning bay is physically built.
- Resource checks or command-computer permissions are explicit.
```

The factory creates normal registered turtles that join the same protocol as hand-provisioned turtles.

## 9. Troubleshooting

| Symptom | Likely cause | First check |
| --- | --- | --- |
| `http.websocket` fails | HTTP/WebSocket blocked | CC: Tweaked HTTP config allow list |
| Turtle disappears | Chunk unloaded | Keep turtle and server-side infrastructure loaded |
| Commands repeat | Ack replay issue | Check command idempotency keys and event spool |
| Position drifts | Odometry without GPS reconciliation | Run GPS check and inspect recent movement events |
| Script denied | Permission manifest mismatch | Validate script manifest against requested action |

See `docs/manual-smoke-test.md` for the full boot, heartbeat, lease, inspect, and reconnect validation procedure.
