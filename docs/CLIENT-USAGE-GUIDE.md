# MASA Orchestrator Client Usage Guide

## Overview

Use one canonical server with three workflow profiles:

- Codex for implementation and verification
- Claude for specification and review
- Gemini for audit and consolidation

All profiles connect to the same `masa-orchestration` server and the same state file. They differ in transport defaults, allowed claims, and tool priority.

## Required Environment

Set these for every profile:

```bash
export AUDIT_ROOT=/Users/lesz/Documents/Synthetic-Mind/Agentic-Spec-Driven-Audit
export ENGINE_ROOT=/Users/lesz/Documents/Synthetic-Mind/synthesis-engine/src
export ADDITIONAL_SCAN_ROOTS=/Users/lesz/Documents/Synthetic-Mind/crucible
```

Optional shared state override:

```bash
export STATE_FILE=/Users/lesz/Documents/Synthetic-Mind/Agentic-Spec-Driven-Audit/.orchestration-state.json
export BENCHMARK_TEST_PATH=/Users/lesz/Documents/Synthetic-Mind/synthesis-engine/src/lib/compute/__tests__/structural-equation-solver.test.ts
```

Initialize the handoff artifacts expected by the workflow:

```bash
npm run agent:bootstrap
```

## When To Use Each Profile

- Use Codex when work must be implemented, tested, or handed off with evidence.
- Use Claude when a task or artifact needs tighter specification, claim review, or assumption checks.
- Use Gemini when the question is whether something is actually validated, benchmarked, or ready to consolidate.

## Recommended Tool Sequences

### Codex

1. `validate_task_header`
2. `check_notation_compliance`
3. `benchmark_status`
4. `delegation_chain_state`

### Claude

1. `validate_task_header`
2. `audit_claims`
3. `validate_assumption_envelope`
4. `check_notation_compliance`

### Gemini

1. `benchmark_status`
2. `llm_independence_check`
3. `generate_consolidation`
4. `audit_claims`

## Local Process Setup For Codex

Start the server in process mode:

```bash
cd /Users/lesz/Documents/masa-orchestrator-mcp/masa-orchestrator-mcp
npm run dev
```

Example process-based MCP client config:

```json
{
  "mcpServers": {
    "masa-orchestration": {
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "/Users/lesz/Documents/masa-orchestrator-mcp/masa-orchestrator-mcp",
      "env": {
        "AUDIT_ROOT": "/Users/lesz/Documents/Synthetic-Mind/Agentic-Spec-Driven-Audit",
        "ENGINE_ROOT": "/Users/lesz/Documents/Synthetic-Mind/synthesis-engine/src",
        "ADDITIONAL_SCAN_ROOTS": "/Users/lesz/Documents/Synthetic-Mind/crucible",
        "STATE_FILE": "/Users/lesz/Documents/Synthetic-Mind/Agentic-Spec-Driven-Audit/.orchestration-state.json"
      }
    }
  }
}
```

## Remote Setup For Claude And Gemini

### Claude Custom Connector (production)

The live deployment is available at `https://mcp.wuweism.com/mcp`. Claude connects via a custom connector using OAuth 2.0 PKCE with Dynamic Client Registration — no manual credentials needed.

For full setup instructions, verification commands, and troubleshooting see:

[CLAUDE-CONNECTOR-SETUP.md](CLAUDE-CONNECTOR-SETUP.md)

### Local HTTP mode

Start the server in HTTP mode:

```bash
cd /Users/lesz/Documents/masa-orchestrator-mcp/masa-orchestrator-mcp
npm run dev:http
```

Current production deploy path on the Droplet is different:

```bash
ssh <deploy-user>@<droplet-host> 'cd /srv/masa/masa-orchestrator-mcp && git pull origin main'
```

Default endpoint:

```text
http://127.0.0.1:3100/mcp
```

Health check:

```bash
curl http://127.0.0.1:3100/health
```

Example HTTP MCP client config:

```json
{
  "mcpServers": {
    "masa-orchestration": {
      "url": "http://127.0.0.1:3100/mcp"
    }
  }
}
```

## Shared State Warning

All three profiles read the same benchmark and delegation state. Treat the server as the source of truth, not the individual client session.

If Codex updates delegation state during execution, Claude and Gemini should review that state rather than recreating it manually.

## Path Guardrails

`check_notation_compliance`, `audit_claims`, and `validate_assumption_envelope` only accept paths inside the configured scan roots: `AUDIT_ROOT`, `ENGINE_ROOT`, and any roots listed in `ADDITIONAL_SCAN_ROOTS`.

If you need to scan a different repo or spec directory, add it to `ADDITIONAL_SCAN_ROOTS` first. The server rejects out-of-root paths by design.
