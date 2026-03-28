import type { ToolCatalogEntry } from "../types.js";

const DELEGATION_AGENT_OPTIONS = ["codex", "claude", "gemini"] as const;
const DELEGATION_STATUS_OPTIONS = [
  "delegated",
  "in_review",
  "approved",
  "in_progress",
  "delivered",
  "verified",
  "consolidated",
  "rejected",
  "rework",
  "blocked",
] as const;

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: "validate_task_header",
    displayName: "Validate Task Header",
    category: "workflow",
    riskLevel: "low",
    mutatesState: false,
    summary: "Check MASA task headers against section mapping and claim-discipline guardrails.",
    recommendedInputs: [
      "Task header fields from a draft task artifact",
      "Exact section mapping like Causal Engine v1.0 / Section 7",
    ],
    fields: [
      { name: "taskId", label: "Task ID", kind: "text", required: true, placeholder: "TASK-009" },
      { name: "taskType", label: "Task Type", kind: "text", required: true, placeholder: "Implementation" },
      { name: "category", label: "Category", kind: "text", required: true, placeholder: "orchestration" },
      {
        name: "specMapping",
        label: "Spec Mapping",
        kind: "text",
        required: true,
        placeholder: "Causal Engine v1.0 / Section 7",
      },
      {
        name: "coreOrNonCore",
        label: "Core Scope",
        kind: "select",
        required: true,
        options: ["Core", "Non-Core"],
      },
      {
        name: "formalArtifactExpected",
        label: "Formal Artifact",
        kind: "text",
        required: true,
        placeholder: "implementation_plan.md",
      },
      {
        name: "benchmarkImpact",
        label: "Benchmark Impact",
        kind: "text",
        required: true,
        placeholder: "B1-B6",
      },
      {
        name: "claimBoundary",
        label: "Claim Boundary",
        kind: "textarea",
        required: true,
        rows: 3,
        placeholder: "No production runtime closure.",
      },
    ],
  },
  {
    name: "check_notation_compliance",
    displayName: "Check Notation Compliance",
    category: "compliance",
    riskLevel: "medium",
    mutatesState: false,
    summary: "Scan files for notation and claim-discipline drift using classification-aware rules.",
    recommendedInputs: [
      "Engine-core path for v1.0 compliance scans",
      "Narrow path slices when investigating noisy output",
      "Path must be inside one of the configured scan roots",
    ],
    fields: [
      {
        name: "path",
        label: "Scan Path",
        kind: "text",
        required: true,
        placeholder: "Path under a configured scan root",
      },
      { name: "glob", label: "Glob Filter", kind: "text", placeholder: "**/*.ts" },
      {
        name: "scope",
        label: "Scope",
        kind: "select",
        required: true,
        options: ["v1.0-engine", "v1.1-deferred", "all"],
        defaultValue: "v1.0-engine",
      },
    ],
  },
  {
    name: "audit_claims",
    displayName: "Audit Claims",
    category: "compliance",
    riskLevel: "medium",
    mutatesState: false,
    summary: "Check comments, names, and docs for overclaim language relative to benchmark support.",
    recommendedInputs: [
      "Focused files or directories under review",
      "Current benchmark passing count for claim calibration",
      "Path must be inside one of the configured scan roots",
    ],
    fields: [
      { name: "path", label: "Audit Path", kind: "text", required: true, placeholder: "/abs/path/to/file-or-dir" },
      {
        name: "target",
        label: "Target",
        kind: "select",
        required: true,
        options: ["code-comments", "function-names", "variable-names", "jsdoc", "all"],
        defaultValue: "all",
      },
      {
        name: "benchmarksPassing",
        label: "Benchmarks Passing",
        kind: "number",
        required: true,
        defaultValue: 0,
      },
    ],
  },
  {
    name: "benchmark_status",
    displayName: "Benchmark Status",
    category: "benchmarks",
    riskLevel: "medium",
    mutatesState: false,
    summary: "Run or report B1-B6 benchmark state, capability statement, and consolidation readiness.",
    recommendedInputs: [
      "Use report for dashboards and run for fresh verification",
      "Point at the canonical structural-equation benchmark file",
    ],
    fields: [
      { name: "testPath", label: "Test Path", kind: "text", required: true, placeholder: "/abs/path/to/test.ts" },
      {
        name: "action",
        label: "Action",
        kind: "select",
        required: true,
        options: ["report", "run"],
        defaultValue: "report",
      },
    ],
  },
  {
    name: "llm_independence_check",
    displayName: "LLM Independence Check",
    category: "compliance",
    riskLevel: "low",
    mutatesState: false,
    summary: "Verify that engine-core code does not depend on prompts or LLM-only reasoning paths.",
    recommendedInputs: [
      "Point at the engine compute path rather than the whole repo",
      "Use excludePaths only for known generated or third-party folders",
    ],
    fields: [
      { name: "enginePath", label: "Engine Path", kind: "text", required: true, placeholder: "/abs/path/to/engine" },
      {
        name: "excludePaths",
        label: "Exclude Paths",
        kind: "string-array",
        placeholder: "One path per line",
      },
    ],
  },
  {
    name: "delegation_chain_state",
    displayName: "Delegation Chain State",
    category: "delegation",
    riskLevel: "high",
    mutatesState: true,
    summary: "Read or update MASA delegation state, queues, and blocker history.",
    recommendedInputs: [
      "Use get for dashboards and update only with explicit operator confirmation",
      "Keep notes concrete so the audit trail stays useful",
    ],
    fields: [
      {
        name: "action",
        label: "Action",
        kind: "select",
        required: true,
        options: ["get", "update"],
        defaultValue: "get",
      },
      { name: "taskId", label: "Task ID", kind: "text", placeholder: "TASK-009" },
      { name: "taskType", label: "Task Type", kind: "text", placeholder: "Implementation" },
      {
        name: "newStatus",
        label: "New Status",
        kind: "select",
        options: [...DELEGATION_STATUS_OPTIONS],
      },
      {
        name: "agent",
        label: "Agent",
        kind: "select",
        options: [...DELEGATION_AGENT_OPTIONS],
      },
      {
        name: "notes",
        label: "Notes",
        kind: "textarea",
        rows: 3,
        placeholder: "State transition rationale",
      },
    ],
  },
  {
    name: "generate_consolidation",
    displayName: "Generate Consolidation",
    category: "consolidation",
    riskLevel: "medium",
    mutatesState: false,
    summary: "Create a conservative readiness statement from benchmark, compliance, and blocker data.",
    recommendedInputs: [
      "Run after benchmark and compliance checks",
      "Use one cycle number per review round",
    ],
    fields: [
      { name: "cycleNumber", label: "Cycle Number", kind: "number", required: true, defaultValue: 1 },
    ],
  },
  {
    name: "validate_assumption_envelope",
    displayName: "Validate Assumption Envelope",
    category: "compliance",
    riskLevel: "medium",
    mutatesState: false,
    summary: "Check engine-core files against the declared v1 assumption envelope.",
    recommendedInputs: [
      "Use engine-core slices instead of the entire workspace",
      "Path must be inside one of the configured scan roots",
    ],
    fields: [
      {
        name: "path",
        label: "Path",
        kind: "text",
        required: true,
        placeholder: "Path under a configured scan root",
      },
    ],
  },
  {
    name: "check_frontend_compliance",
    displayName: "Check Frontend Compliance",
    category: "compliance",
    riskLevel: "medium",
    mutatesState: false,
    summary: "Scan React components for structural UI robustness, dark mode parity, and Awwwards aesthetic enforcement.",
    recommendedInputs: [
      "Path to the crucible components or app directory",
    ],
    fields: [
      { name: "targetPath", label: "Target Path", kind: "text", required: true, placeholder: "/abs/path/to/crucible/src" },
      { name: "glob", label: "Glob Filter", kind: "text", placeholder: "**/*.tsx" },
    ],
  },
] as const;

export const TOOL_CATALOG_BY_NAME = Object.fromEntries(
  TOOL_CATALOG.map((entry) => [entry.name, entry])
) as Record<string, ToolCatalogEntry>;
