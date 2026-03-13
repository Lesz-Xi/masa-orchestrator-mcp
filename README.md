# MASA Orchestrator MCP

Guardrail enforcement and delegation management MCP server for MASA.

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
```

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

## Verify

```bash
npm run build
npm test
```

## Package Layout

- `src/` server, tools, adapters, validation
- `profiles/` model-specific workflow profiles
- `prompts/` profile prompt templates
- `docs/` operator-facing guides
- `examples/` example environment files
- `tests/` package verification
