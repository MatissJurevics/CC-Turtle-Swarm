# Manual CC: Tweaked Smoke Test

Run this after `npm run validate` passes and the server is reachable from Minecraft.

## Server

1. Start the server:

   ```sh
   npm start
   ```

2. Confirm the console prints a listening message with port `8787`.
3. Open the operator console at:

   ```text
   http://HOST:8787/console
   ```

4. Confirm `/health` returns:

   ```json
   { "ok": true, "service": "computercraft-turtle-fleet" }
   ```

## Turtle Install

1. In the console, use "Pair a new turtle".
2. Confirm the host is reachable from inside Minecraft.
3. Copy the generated command. It should look like:

   ```lua
   wget run http://HOST:8787/turtle/install.lua http://HOST:8787 dev-pairing-token fleet-dev-001
   ```

4. Paste the command into the turtle terminal.
5. Expected turtle filesystem after reboot:

   ```text
   /startup.lua
   /fleet/runtime/config.lua
   /fleet/runtime/logger.lua
   /fleet/runtime/spool.lua
   /fleet/runtime/actuator.lua
   /fleet/runtime/transport.lua
   /fleet/runtime/watchdog.lua
   /fleet/runtime/executor.lua
   /fleet/runtime/odometry.lua
   /fleet/runtime/main.lua
   ```

Manual fallback: build the bundle, copy the files above, and create `/fleet/config.lua`:

   ```lua
   return {
     turtle_id = "fleet-dev-001",
     fleet_url = "ws://HOST:8787/turtle/ws",
     pairing_token = "dev-pairing-token",
     runtime_version = "0.1.0"
   }
   ```

## Turtle Boot

1. Put the turtle in a loaded chunk.
2. Add fuel.
3. Reboot:

   ```lua
   os.reboot()
   ```

4. Expected server/UI result:

   ```text
   - turtle appears in fleet table
   - status is online
   - fuel is visible
   - runtime version is visible
   - heartbeat events appear in turtle logs
   ```

## First Safe Command

1. Select the turtle in the operator console.
2. Enter holder `operator`.
3. Click `Lease`.
4. Click `Inspect`.
5. Expected result:

   ```text
   - command appears in command list/API
   - turtle runs inspect
   - event.action.completed is logged
   - world query for the adjacent cell shows air, solid, liquid, or unknown
   ```

## Failure Checks

| Check | Expected result |
| --- | --- |
| Stop the server | Turtle keeps running, retries WebSocket with backoff |
| Restart the server | Turtle reconnects and replays unacked spool events |
| Send action without lease | API rejects it |
| Block turtle front and move forward | Action completes failed with blocked reason |
| Remove fuel | Movement command fails or is rejected before unsafe behavior |

## Pass Criteria

```text
- boot, heartbeat, lease, inspect, and event replay work
- the operator console reflects turtle state
- failure reasons are visible in diagnostics
- no raw Lua or rednet command path is needed
```
