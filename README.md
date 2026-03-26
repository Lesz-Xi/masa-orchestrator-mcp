# MASA Orchestrator MCP

Guardrail enforcement, delegation management, and internal operator console for MASA.

## What It Does

- validates MASA task headers
- checks notation and claim discipline
- audits overclaims
- reports benchmark status
- checks LLM independence for engine-core code
- tracks delegation-chain state
- generates conservative consolidation summaries
- validates the v1 assumption envelope

## Transports

- `stdio` for local process-based clients
- Streamable HTTP for remote or shared clients

Legacy SSE is not implemented.

## Internal Console

This repo now includes a sibling Next.js operator console under `console/`.

- three-zone high-density workbench layout
- internal password-based operator auth
- server-side MCP proxy so the browser never receives the backend bearer token
- benchmark, delegation, compliance, consolidation, and raw tool-runner surfaces

## Client Profiles

This package ships declarative workflow profiles for:

- Codex
- Claude
- Gemini

The profiles are documentation and configuration artifacts around one canonical server. They do not create separate MCP servers.

## Required Environment

```bash
export AUDIT_ROOT=/absolute/path/to/Agentic-Spec-Driven-Audit
export ENGINE_ROOT=/absolute/path/to/synthesis-engine/src
```

Optional:

```bash
export STATE_FILE=/absolute/path/to/.orchestration-state.json
export BENCHMARK_TEST_PATH=/absolute/path/to/structural-equation-solver.test.ts
export ORCHESTRATOR_API_TOKEN=replace-with-strong-shared-token
export ORCHESTRATOR_ALLOWED_ORIGINS=https://masa-console.internal
export ORCHESTRATOR_CONSOLE_PASSWORD_HASH=scrypt:...
export ORCHESTRATOR_CONSOLE_SECRET=replace-with-long-random-secret
export ORCHESTRATOR_MCP_URL=http://127.0.0.1:3100/mcp
```

Bootstrap the session handoff artifacts required by the workflow:

```bash
npm run agent:bootstrap
```

This creates placeholder files under `.agent/state/` when they are missing:

- `session-handoff.json`
- `session-handoff.md`
- `causal-graph-registry.json`
- `identification-cache.json`

## Run

Install dependencies:

```bash
npm install
```

Run in `stdio` mode:

```bash
npm run dev
```

Run in HTTP mode:

```bash
npm run dev:http
```

Default HTTP endpoint:

```text
http://127.0.0.1:3100/mcp
```

Run the operator console:

```bash
cd console
npm install
npm run dev
```

The backend keeps `GET /health` public, but `POST /mcp` and `GET /activity` require:

```text
Authorization: Bearer <ORCHESTRATOR_API_TOKEN>
```

## Production Deploy

Current production deploy target:

- host: `<deploy-user>@<droplet-host>`
- repo root: `/srv/masa/masa-orchestrator-mcp`
- backend service: `masa-orchestrator-backend`
- console service: `masa-orchestrator-console`

Pull only:

```bash
ssh <deploy-user>@<droplet-host> 'cd /srv/masa/masa-orchestrator-mcp && git pull origin main'
```

Pull, rebuild, and restart both services:

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

Droplet environment examples live in:

- `examples/droplet-backend.env`
- `examples/droplet-console.env`

## Verify

```bash
npm run build
npm test
```

## Path Boundaries

Compliance and audit scanners only read files under the configured `AUDIT_ROOT` or `ENGINE_ROOT`.

If you want to scan a different project tree, point those environment variables at that tree first. Out-of-root paths are rejected intentionally.

## Connecting Claude

To connect Claude as a custom MCP connector, see:

[docs/CLAUDE-CONNECTOR-SETUP.md](docs/CLAUDE-CONNECTOR-SETUP.md)

## Package Layout

- `src/` server, tools, adapters, validation
- `console/` internal Next.js operator console
- `profiles/` model-specific workflow profiles
- `prompts/` profile prompt templates
- `docs/` operator-facing guides
- `examples/` example environment files
- `tests/` package verification
