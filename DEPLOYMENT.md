# Deployment Guide

This document explains how to deploy `masa-orchestration` for remote Streamable HTTP use.

## Current Deployment Reality

The server is deployable now, but it has one important constraint:

- it reads directly from local filesystem paths via `AUDIT_ROOT` and `ENGINE_ROOT`

That means a remote deployment only works if the host machine has:

- a local checkout of the MASA audit workspace
- a local checkout of the target engine workspace
- the same files available at the paths passed in the environment

This server is not yet a stateless hosted SaaS service. It is a repo-aware MCP server that must run where the MASA files exist.

## Supported Remote Transport

Remote deployment uses:

- Streamable HTTP only

Legacy SSE is not implemented.

Default routes:

- `GET /`
- `GET /health`
- `POST /mcp`

## Prerequisites

- Node.js 20+
- npm
- a checked-out copy of the `masa-orchestration` repo
- a checked-out MASA workspace with:
  - `Agentic-Spec-Driven-Audit`
  - `synthesis-engine/src`

## Install And Verify

```bash
npm ci
npm run build
npm test
```

If `npm test` runs in a restricted environment, make sure the host allows local port binding for the HTTP transport tests.

## Required Environment Variables

Set these in the deployment environment:

```bash
AUDIT_ROOT=/absolute/path/to/Agentic-Spec-Driven-Audit
ENGINE_ROOT=/absolute/path/to/synthesis-engine/src
MCP_TRANSPORT=http
MCP_HOST=0.0.0.0
MCP_PORT=3100
MCP_PATH=/mcp
```

Recommended:

```bash
STATE_FILE=/absolute/path/to/Agentic-Spec-Driven-Audit/.orchestration-state.json
BENCHMARK_TEST_PATH=/absolute/path/to/synthesis-engine/src/lib/compute/__tests__/structural-equation-solver.test.ts
```

## Start Command

Build first:

```bash
npm run build
```

Start the HTTP server:

```bash
npm run start:http
```

The server binds to the configured host and port and exposes the MCP endpoint at:

```text
http://<host>:<port>/mcp
```

## Health Checks

Use:

```text
GET /health
```

Expected success response:

```json
{
  "status": "ok",
  "name": "masa-orchestration",
  "version": "1.1.0",
  "transport": "http",
  "path": "/mcp"
}
```

## Reverse Proxy Requirements

If you deploy behind a reverse proxy or platform router:

- forward `POST /mcp` unchanged
- keep HTTPS enabled at the edge
- do not rewrite the JSON-RPC body
- do not block long-lived HTTP responses
- keep `GET /health` reachable for health checks

## Single-Instance Warning

The delegation state file uses atomic rename writes, but the server is currently intended for:

- one running server instance
- one shared state file

Do not run multiple independent instances against the same state file unless you add cross-process coordination first.

## Platform Checklists

### Railway

- create a new service from the GitHub repo
- set the root directory to the repo root
- install command: `npm ci`
- build command: `npm run build`
- start command: `npm run start:http`
- set:
  - `MCP_TRANSPORT=http`
  - `MCP_HOST=0.0.0.0`
  - `MCP_PORT=$PORT` is not currently supported directly by the script, so either:
    - set `MCP_PORT` to Railway’s injected port if the platform allows interpolation, or
    - update the deployment start command wrapper to export `MCP_PORT=$PORT`
- mount or clone the MASA workspace so `AUDIT_ROOT` and `ENGINE_ROOT` are real local paths

### Render

- use a Web Service
- build command: `npm ci && npm run build`
- start command: `npm run start:http`
- bind to `0.0.0.0`
- set `MCP_PORT` from Render’s provided port environment if needed
- make sure the MASA workspace exists on disk for the configured roots

### Fly.io

- use a Node app with an internal HTTP service
- expose the HTTP port used by `MCP_PORT`
- set `MCP_HOST=0.0.0.0`
- deploy only if the Fly machine has the required MASA workspace files available locally
- persist the state file on a volume if you want delegation history to survive restarts

### VPS

This is the simplest current deployment model.

Recommended setup:

- clone `masa-orchestrator-mcp`
- clone or sync the MASA workspace onto the same machine
- run under `systemd`, `pm2`, or Docker
- put Nginx or Caddy in front for HTTPS
- route `/mcp` to the Node process

Example process flow:

```bash
git clone https://github.com/Lesz-Xi/masa-orchestrator-mcp.git
cd masa-orchestrator-mcp
npm ci
npm run build
export AUDIT_ROOT=/srv/masa/Agentic-Spec-Driven-Audit
export ENGINE_ROOT=/srv/masa/synthesis-engine/src
export STATE_FILE=/srv/masa/Agentic-Spec-Driven-Audit/.orchestration-state.json
export BENCHMARK_TEST_PATH=/srv/masa/synthesis-engine/src/lib/compute/__tests__/structural-equation-solver.test.ts
export MCP_TRANSPORT=http
export MCP_HOST=0.0.0.0
export MCP_PORT=3100
export MCP_PATH=/mcp
npm run start:http
```

## ChatGPT / Remote MCP Readiness

For ChatGPT-style remote MCP usage, the deployment must provide:

- a publicly reachable HTTPS URL
- a stable `/mcp` endpoint
- working health checks
- a server process that can read the MASA workspace locally

Before calling it ready, verify:

1. `GET /health` returns `200`
2. MCP `tools/list` works remotely
3. MCP `tools/call` works remotely for at least:
   - `validate_task_header`
   - `benchmark_status`
4. the configured `AUDIT_ROOT` and `ENGINE_ROOT` paths are valid on the host
5. delegation state persists across restarts if persistence matters

## What “Remote-Host Checklist” Means

A remote-host checklist is the operator checklist for a deployment target such as Railway, Render, Fly.io, or a VPS. It answers:

- does the host support long-lived HTTP MCP traffic
- can it bind the needed port
- can it expose HTTPS
- can it provide the required environment variables
- can it mount or clone the MASA workspace locally
- can it persist the state file
- can it run as a single authoritative instance

It is not extra product logic. It is the deployment validation list so the server behaves the same way off your laptop.

## Current Gaps

The server is deployable, but these are still true:

- deployment depends on local repo paths existing on the host
- there is no auth layer yet
- there is no multi-instance state coordination yet
- there is no container recipe yet
- there is no platform-specific wrapper for dynamic platform ports beyond env configuration

## Recommended First Production Shape

Use a VPS first.

Reasons:

- easiest way to guarantee local filesystem paths exist
- easiest way to keep one authoritative state file
- easiest way to put the server behind HTTPS without platform path surprises

After that, if you want a more managed deployment, move to Railway, Render, or Fly.io with a deliberate workspace-mount strategy.
