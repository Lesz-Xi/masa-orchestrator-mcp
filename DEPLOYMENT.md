# Deployment Guide

This document explains how to deploy `masa-orchestration` as an internal two-part product:

1. the authenticated MCP backend
2. the internal Next.js operator console

## Current Deployment Reality

The server is deployable now, but it has one important constraint:

- it reads directly from local filesystem paths via `AUDIT_ROOT` and `ENGINE_ROOT`

That means a remote deployment only works if the host machine has:

- a local checkout of the MASA audit workspace
- a local checkout of the target engine workspace
- the same files available at the paths passed in the environment

This server is not yet a stateless hosted SaaS service. It is a repo-aware MCP server that must run where the MASA files exist.

## Current Production Target

The current production deployment is a single DigitalOcean Droplet reached over SSH:

- host: `<deploy-user>@<droplet-host>`
- app root: `/srv/masa/masa-orchestrator-mcp`
- backend service: `masa-orchestrator-backend`
- console service: `masa-orchestrator-console`

The deployment model is not abstract here. The repo should assume:

- backend code lives at `/srv/masa/masa-orchestrator-mcp`
- console code lives at `/srv/masa/masa-orchestrator-mcp/console`
- MASA workspaces are mounted locally on the same Droplet under `/srv/masa`

## SSH Deployment Commands

Pull only:

```bash
ssh <deploy-user>@<droplet-host> 'cd /srv/masa/masa-orchestrator-mcp && git pull origin main'
```

Full backend + console rebuild and restart:

```bash
ssh <deploy-user>@<droplet-host> '
cd /srv/masa/masa-orchestrator-mcp &&
git pull origin main &&
npm ci &&
npm run build &&
systemctl restart masa-orchestrator-backend &&
cd /srv/masa/masa-orchestrator-mcp/console &&
npm run build &&
systemctl restart masa-orchestrator-console
'
```

Post-deploy checks:

```bash
ssh <deploy-user>@<droplet-host> '
systemctl status masa-orchestrator-backend --no-pager &&
systemctl status masa-orchestrator-console --no-pager
'
```

```bash
curl -s https://mcp.wuweism.com/health | jq .
```

## Supported Remote Transport

Remote deployment uses:

- Streamable HTTP only

Legacy SSE is not implemented.

Default routes:

- `GET /`
- `GET /health`
- `POST /mcp`
- `GET /activity`

The browser should not call `POST /mcp` directly. The operator console proxies requests server-side.

## Prerequisites

- Node.js 20+
- npm
- a checked-out copy of the `masa-orchestrator-mcp` repo
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
ORCHESTRATOR_API_TOKEN=replace-with-strong-shared-token
ORCHESTRATOR_ALLOWED_ORIGINS=https://console.internal.example
ORCHESTRATOR_RATE_LIMIT_WINDOW_MS=60000
ORCHESTRATOR_RATE_LIMIT_MAX=60
ORCHESTRATOR_MAX_BODY_BYTES=1048576
```

Recommended:

```bash
STATE_FILE=/absolute/path/to/Agentic-Spec-Driven-Audit/.orchestration-state.json
BENCHMARK_TEST_PATH=/absolute/path/to/synthesis-engine/src/lib/compute/__tests__/structural-equation-solver.test.ts
ORCHESTRATOR_MCP_URL=https://mcp.internal.example/mcp
ORCHESTRATOR_CONSOLE_PASSWORD_HASH=scrypt:<salt-hex>:<hash-hex>
ORCHESTRATOR_CONSOLE_SECRET=replace-with-long-random-secret
```

Hash generation example:

```bash
node -e "const crypto=require('node:crypto'); const salt=crypto.randomBytes(16); const hash=crypto.scryptSync(process.argv[1], salt, 64); console.log(`scrypt:${salt.toString('hex')}:${hash.toString('hex')}`)" 'replace-with-password'
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

## Console Commands

The operator console lives in `console/`.

Install once:

```bash
cd console
npm ci
```

Run in development:

```bash
npm run dev
```

Build for production:

```bash
npm run build
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
  "version": "1.2.0",
  "transport": "http",
  "path": "/mcp",
  "authMode": "bearer",
  "consoleCompatibilityVersion": "1.0.0"
}
```

Recent request audit log:

```text
GET /activity
Authorization: Bearer <ORCHESTRATOR_API_TOKEN>
```

## Reverse Proxy Requirements

If you deploy behind a reverse proxy or platform router:

- forward `POST /mcp` unchanged
- forward `GET /activity` to the backend
- keep HTTPS enabled at the edge
- do not rewrite the JSON-RPC body
- do not block long-lived HTTP responses
- keep `GET /health` reachable for health checks
- do not expose `ORCHESTRATOR_API_TOKEN` to browser code

Recommended split:

- `mcp.internal.example` → MCP backend
- `console.internal.example` → operator console

## Recommended Wuweism Deployment

For your current domain, the cleanest split is:

- `https://mcp.wuweism.com` → MASA Orchestrator MCP backend
- `https://orchestrator.wuweism.com` → MASA Orchestrator operator console

Endpoint mapping:

- backend health: `https://mcp.wuweism.com/health`
- backend MCP: `https://mcp.wuweism.com/mcp`
- backend audit log: `https://mcp.wuweism.com/activity`
- console UI: `https://orchestrator.wuweism.com`

Suggested backend environment:

```bash
AUDIT_ROOT=/srv/masa/Agentic-Spec-Driven-Audit
ENGINE_ROOT=/srv/masa/synthesis-engine/src
STATE_FILE=/srv/masa/Agentic-Spec-Driven-Audit/.orchestration-state.json
BENCHMARK_TEST_PATH=/srv/masa/synthesis-engine/src/lib/compute/__tests__/structural-equation-solver.test.ts
MCP_TRANSPORT=http
MCP_HOST=0.0.0.0
MCP_PORT=3100
MCP_PATH=/mcp
ORCHESTRATOR_API_TOKEN=replace-with-long-random-token
ORCHESTRATOR_ALLOWED_ORIGINS=https://orchestrator.wuweism.com
ORCHESTRATOR_RATE_LIMIT_WINDOW_MS=60000
ORCHESTRATOR_RATE_LIMIT_MAX=60
ORCHESTRATOR_MAX_BODY_BYTES=1048576
```

Suggested console environment:

```bash
ORCHESTRATOR_MCP_URL=https://mcp.wuweism.com/mcp
ORCHESTRATOR_API_TOKEN=replace-with-the-same-backend-token
ORCHESTRATOR_CONSOLE_PASSWORD_HASH=scrypt:<salt-hex>:<hash-hex>
ORCHESTRATOR_CONSOLE_SECRET=replace-with-long-random-secret
```

Suggested DNS records:

- `mcp.wuweism.com` → your VPS public IP
- `orchestrator.wuweism.com` → your VPS public IP

If you prefer a single-host path layout instead:

- `https://wuweism.com/orchestrator` → console
- `https://wuweism.com/orchestrator-api/mcp` → backend

But the subdomain split is cleaner and easier to secure.

Once deployed, to connect Claude as a custom MCP connector see:

[docs/CLAUDE-CONNECTOR-SETUP.md](docs/CLAUDE-CONNECTOR-SETUP.md)

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

- provision a Droplet or equivalent VPS
- clone `masa-orchestrator-mcp` to `/srv/masa/masa-orchestrator-mcp`
- clone or sync the MASA workspace onto the same machine under `/srv/masa`
- run under `systemd`, `pm2`, or Docker
- put Nginx or Caddy in front for HTTPS
- route `/mcp` to the Node process

Example process flow:

```bash
git clone https://github.com/Lesz-Xi/masa-orchestrator-mcp.git
mv masa-orchestrator-mcp /srv/masa/masa-orchestrator-mcp
cd /srv/masa/masa-orchestrator-mcp
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
export ORCHESTRATOR_API_TOKEN=replace-with-strong-shared-token
export ORCHESTRATOR_ALLOWED_ORIGINS=https://console.internal.example
npm run start:http
```

Console process:

```bash
cd /srv/masa/masa-orchestrator-mcp/console
npm ci
export ORCHESTRATOR_MCP_URL=https://mcp.internal.example/mcp
export ORCHESTRATOR_API_TOKEN=replace-with-strong-shared-token
export ORCHESTRATOR_CONSOLE_PASSWORD_HASH=scrypt:<salt-hex>:<hash-hex>
export ORCHESTRATOR_CONSOLE_SECRET=replace-with-long-random-secret
export AUDIT_ROOT=/srv/masa/Agentic-Spec-Driven-Audit
export ENGINE_ROOT=/srv/masa/synthesis-engine/src
export BENCHMARK_TEST_PATH=/srv/masa/synthesis-engine/src/lib/compute/__tests__/structural-equation-solver.test.ts
npm run build
npm run start
```

Recommended console startup port on the same host:

```bash
PORT=3200 npm run start
```

If you are operating the current production Droplet, prefer the SSH deployment commands earlier in this document instead of re-running the bootstrap flow manually.

Example Nginx split for `wuweism.com`:

```nginx
server {
  server_name mcp.wuweism.com;

  location /health {
    proxy_pass http://127.0.0.1:3100/health;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location /activity {
    proxy_pass http://127.0.0.1:3100/activity;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location /mcp {
    proxy_pass http://127.0.0.1:3100/mcp;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 300s;
    client_max_body_size 2m;
  }
}

server {
  server_name orchestrator.wuweism.com;

  location / {
    proxy_pass http://127.0.0.1:3200;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
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
- console auth is shared internal auth, not full multi-operator RBAC
- there is no multi-instance state coordination yet
- there is no container recipe yet
- there is no platform-specific wrapper for dynamic platform ports beyond env configuration
- request audit history is stored in the shared state file, not a separate durable audit database

## Recommended First Production Shape

Use a VPS first.

Reasons:

- easiest way to guarantee local filesystem paths exist
- easiest way to keep one authoritative state file
- easiest way to put the server behind HTTPS without platform path surprises

After that, if you want a more managed deployment, move to Railway, Render, or Fly.io with a deliberate workspace-mount strategy.
