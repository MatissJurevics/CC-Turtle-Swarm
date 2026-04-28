# ComputerCraft Turtle Fleet

Autonomous CC: Tweaked turtle fleet control stack.

This repo is organized around a small supervised turtle runtime, a control-plane server, and operator-facing documentation. The architecture is event-first, lease-controlled, and observable: turtles execute wrapped actions, the server records events, and humans or agents operate through validated APIs instead of raw turtle access.

## Project Layout

```text
docs/
  architecture.md          Full architecture spec.
  in-game-setup.md         Step-by-step CC: Tweaked setup.
  qa-validation-matrix.md  Component validation checklist.
server/
  src/                     Control-plane scaffold.
turtle/
  install.lua              One-paste turtle installer served by the web app.
  startup.lua              Minimal bootloader installed on turtles.
  runtime/                 Supervised turtle runtime modules.
```

## MVP Path

1. Run the control-plane server locally.
2. Enable CC: Tweaked HTTP/WebSocket access for the server URL.
3. Open the web console and copy the generated turtle install command.
4. Paste the `wget run ...` command into one turtle.
5. Validate heartbeat, telemetry, and one safe command.
6. Expand from one turtle to jobs, scripts, world model, and factory provisioning.

## Setup Helpers

The easiest turtle setup path is in the website:

```text
http://HOST:8787/console
```

Use the "Pair a new turtle" panel to copy a command shaped like:

```lua
wget run http://HOST:8787/turtle/install.lua http://HOST:8787 dev-pairing-token fleet-dev-001
```

The installer downloads `/startup.lua` and `/fleet/runtime/*.lua`, writes `/fleet/config.lua`, labels the turtle, and reboots it into the supervised runtime.

Build a deployable turtle file tree:

```sh
npm run bundle:turtle
```

This writes `dist/turtle-bundle/` with `/startup.lua`, `/fleet/runtime/*.lua`, and a manifest showing where files belong on the turtle.

Print the startup file for copy/paste:

```sh
npm run paste:startup
```

Run the current validation suite:

```sh
npm run validate
```

`validate` runs Node tests, builds the turtle bundle, checks core docs, and runs Lua syntax validation when `luac` is available.

## Docker Compose

Run the control plane, gateway, MCP adapter surface, and operator console:

```sh
cp .env.example .env
docker compose up --build
```

See [docs/docker-compose.md](/home/matiss/Code/ccScripts/docs/docker-compose.md) for details.

## Safety Defaults

- Turtles connect outbound to the server.
- Runtime actions go through wrappers.
- Mutating operations require leases.
- Raw arbitrary Lua execution is not exposed as an operator tool.
- Events are append-only and suitable for replay/debugging.
