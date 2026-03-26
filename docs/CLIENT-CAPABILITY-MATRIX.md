# MASA Orchestrator Client Capability Matrix

## Canonical Server

All client profiles target the same canonical server:

- Server id: `masa-orchestration`
- Display name: `MASA Orchestrator MCP`
- Shared state file: `Agentic-Spec-Driven-Audit/.orchestration-state.json`

## Operator Matrix

| Session Type | Recommended Profile | Primary Transport | Reason |
| --- | --- | --- | --- |
| Local implementation session | Codex | `stdio` | Tight loop for code, checks, and evidence capture |
| Spec or review session | Claude | `http` | Review-oriented access without local process coupling |
| Audit or signoff session | Gemini | `http` | Audit-oriented access to shared benchmark and consolidation truth |

## Profile Summary

| Profile | Role | Claim Mode | Delegation Authority | First Tools |
| --- | --- | --- | --- | --- |
| Codex | executor | `standard` | `update_state` | `validate_task_header`, `check_notation_compliance`, `benchmark_status`, `delegation_chain_state` |
| Claude | specifier | `strict` | `read_only` | `validate_task_header`, `audit_claims`, `validate_assumption_envelope`, `check_notation_compliance` |
| Gemini | auditor | `strict` | `read_only` | `benchmark_status`, `llm_independence_check`, `generate_consolidation`, `audit_claims` |

## Tool Coverage

| Tool | Codex | Claude | Gemini |
| --- | --- | --- | --- |
| `validate_task_header` | yes | yes | no |
| `check_notation_compliance` | yes | yes | yes |
| `audit_claims` | no | yes | yes |
| `benchmark_status` | yes | yes | yes |
| `llm_independence_check` | yes | no | yes |
| `delegation_chain_state` | yes | no | yes |
| `generate_consolidation` | yes | yes | yes |
| `validate_assumption_envelope` | yes | yes | no |

## Guardrail Notes

- The server remains model-agnostic.
- Profiles shape invocation style and responsibility boundaries only.
- Remote use is Streamable HTTP.
- Process-based local use is available for Codex and as fallback for the other profiles.
- All shipped profiles should use search-first, partial-read behavior for large files instead of whole-file reads.
