# Docker Compose Setup

This Compose setup runs the current fleet stack as one container:

```text
- control-plane HTTP API
- turtle WebSocket gateway at /turtle/ws
- operator web console
- MCP adapter surface in the server process
```

The current implementation uses in-memory state. Do not add a database container until the control plane has a real persistent event-store adapter.

## Start

```sh
cp .env.example .env
docker compose up --build
```

Operator console:

```text
http://127.0.0.1:8787/
```

Health check:

```text
http://127.0.0.1:8787/health
```

## Turtle Config

Use the host/IP and token from `.env`:

```lua
return {
  turtle_id = "fleet-dev-001",
  fleet_url = "ws://HOST:8787/turtle/ws",
  pairing_token = "dev-pairing-token",
  runtime_version = "0.1.0",
  dimension = "overworld",
  initial_facing = "north",
  initial_position = nil
}
```

If Minecraft is not on the same machine, replace `HOST` with the Docker host's LAN address.

## Commands

```sh
docker compose up --build
docker compose ps
docker compose logs -f control-plane
docker compose down
```

## Validation

Run local validation before building:

```sh
npm run validate
```

Then validate the Compose model:

```sh
docker compose config
```

