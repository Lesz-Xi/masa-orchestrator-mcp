export const TOOL_NAME_LIST = [
  "validate_task_header",
  "check_notation_compliance",
  "audit_claims",
  "benchmark_status",
  "llm_independence_check",
  "delegation_chain_state",
  "generate_consolidation",
  "validate_assumption_envelope",
  "check_frontend_compliance"
] as const;

export const TOOL_NAMES = {
  validateTaskHeader: TOOL_NAME_LIST[0],
  checkNotationCompliance: TOOL_NAME_LIST[1],
  auditClaims: TOOL_NAME_LIST[2],
  benchmarkStatus: TOOL_NAME_LIST[3],
  llmIndependenceCheck: TOOL_NAME_LIST[4],
  delegationChainState: TOOL_NAME_LIST[5],
  generateConsolidation: TOOL_NAME_LIST[6],
  validateAssumptionEnvelope: TOOL_NAME_LIST[7],
  checkFrontendCompliance: TOOL_NAME_LIST[8],
} as const;

export type ToolName = (typeof TOOL_NAME_LIST)[number];
