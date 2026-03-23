import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { loadBenchmarkMap, loadEngineCategories, loadNotationRules, loadRuntimeConfig } from "./config/load-config.js";
import { DelegationStore } from "./state/delegation-store.js";
import { TOOL_CATALOG_BY_NAME } from "./shared/tool-catalog.js";
import { auditClaims, auditClaimsSchema } from "./tools/audit-claims.js";
import { benchmarkStatus, benchmarkStatusSchema } from "./tools/benchmark-status.js";
import { checkNotationCompliance, checkNotationSchema } from "./tools/check-notation-compliance.js";
import { delegationChainState, delegationStateSchema } from "./tools/delegation-chain-state.js";
import { generateConsolidation, generateConsolidationSchema } from "./tools/generate-consolidation.js";
import { llmIndependenceCheck, llmIndependenceSchema } from "./tools/llm-independence-check.js";
import { TOOL_NAMES } from "./tool-names.js";
import { validateAssumptionEnvelope, validateEnvelopeSchema } from "./tools/validate-assumption-envelope.js";
import { validateTaskHeader, validateTaskHeaderSchema } from "./tools/validate-task-header.js";
import type { BenchmarkMapConfig, NotationRule, RuntimeConfig } from "./types.js";

type ToolResult = Record<string, unknown>;

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: unknown) => Promise<ToolResult>;
}

export interface ServerDependencies {
  runtimeConfig: RuntimeConfig;
  notationRules: NotationRule[];
  engineCategories: string[];
  benchmarkMap: BenchmarkMapConfig;
  store: DelegationStore;
}

export function createServerDependencies(importMetaUrl: string): ServerDependencies {
  const runtimeConfig = loadRuntimeConfig(importMetaUrl);
  const notationRules = loadNotationRules(importMetaUrl);
  const engineCategories = loadEngineCategories(importMetaUrl);
  const benchmarkMap = loadBenchmarkMap(importMetaUrl);
  const store = new DelegationStore(runtimeConfig.stateFile);

  return {
    runtimeConfig,
    notationRules,
    engineCategories,
    benchmarkMap,
    store,
  };
}

export function createServerFromDependencies({
  runtimeConfig,
  notationRules,
  engineCategories,
  benchmarkMap,
  store,
}: ServerDependencies) {
  const tools: ToolDefinition[] = [
    {
      name: TOOL_NAMES.validateTaskHeader,
      description: "Validate a task header against MASA spec guardrails.",
      inputSchema: {
        type: "object",
        required: [
          "taskId",
          "taskType",
          "category",
          "specMapping",
          "coreOrNonCore",
          "formalArtifactExpected",
          "benchmarkImpact",
          "claimBoundary",
        ],
        properties: {
          taskId: { type: "string" },
          taskType: { type: "string" },
          category: { type: "string" },
          specMapping: { type: "string" },
          coreOrNonCore: { type: "string" },
          formalArtifactExpected: { type: "string" },
          benchmarkImpact: { type: "string" },
          claimBoundary: { type: "string" },
        },
      },
      execute: async (input) =>
        validateTaskHeader(validateTaskHeaderSchema.parse(input), engineCategories) as Promise<ToolResult>,
    },
    {
      name: TOOL_NAMES.checkNotationCompliance,
      description: "Scan files for notation and claim-discipline violations.",
      inputSchema: {
        type: "object",
        required: ["path", "scope"],
        properties: {
          path: { type: "string" },
          glob: { type: "string" },
          scope: { type: "string", enum: ["v1.0-engine", "v1.1-deferred", "all"] },
        },
      },
      execute: async (input) =>
        checkNotationCompliance(checkNotationSchema.parse(input), runtimeConfig, notationRules) as Promise<ToolResult>,
    },
    {
      name: TOOL_NAMES.auditClaims,
      description: "Audit code, comments, and names for overclaims.",
      inputSchema: {
        type: "object",
        required: ["path", "target", "benchmarksPassing"],
        properties: {
          path: { type: "string" },
          target: { type: "string", enum: ["code-comments", "function-names", "variable-names", "jsdoc", "all"] },
          benchmarksPassing: { type: "integer", minimum: 0, maximum: 6 },
        },
      },
      execute: async (input) =>
        auditClaims(auditClaimsSchema.parse(input), runtimeConfig) as Promise<ToolResult>,
    },
    {
      name: TOOL_NAMES.benchmarkStatus,
      description: "Run or report B1-B6 benchmark status.",
      inputSchema: {
        type: "object",
        required: ["testPath", "action"],
        properties: {
          testPath: { type: "string" },
          action: { type: "string", enum: ["run", "report"] },
        },
      },
      execute: async (input) =>
        benchmarkStatus(benchmarkStatusSchema.parse(input), {
          runtimeConfig,
          benchmarkMap,
          notationRules,
          store,
        }) as Promise<ToolResult>,
    },
    {
      name: TOOL_NAMES.llmIndependenceCheck,
      description: "Check whether engine-core paths contain LLM dependency or prompt usage.",
      inputSchema: {
        type: "object",
        required: ["enginePath"],
        properties: {
          enginePath: { type: "string" },
          excludePaths: { type: "array", items: { type: "string" } },
        },
      },
      execute: async (input) =>
        llmIndependenceCheck(llmIndependenceSchema.parse(input), runtimeConfig) as Promise<ToolResult>,
    },
    {
      name: TOOL_NAMES.delegationChainState,
      description: "Read or update MASA delegation pipeline state.",
      inputSchema: {
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string", enum: ["get", "update"] },
          taskId: { type: "string" },
          taskType: { type: "string" },
          newStatus: { type: "string" },
          agent: { type: "string", enum: ["gemini", "claude", "gpt"] },
          notes: { type: "string" },
        },
      },
      execute: async (input) =>
        delegationChainState(delegationStateSchema.parse(input), store) as Promise<ToolResult>,
    },
    {
      name: TOOL_NAMES.generateConsolidation,
      description: "Generate a consolidation statement from verified benchmark and compliance data.",
      inputSchema: {
        type: "object",
        required: ["cycleNumber"],
        properties: {
          cycleNumber: { type: "integer", minimum: 1 },
        },
      },
      execute: async (input) =>
        generateConsolidation(generateConsolidationSchema.parse(input), {
          runtimeConfig,
          benchmarkMap,
          notationRules,
          store,
        }) as Promise<ToolResult>,
    },
    {
      name: TOOL_NAMES.validateAssumptionEnvelope,
      description: "Validate engine-core files against the v1.0 assumption envelope.",
      inputSchema: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string" },
        },
      },
      execute: async (input) =>
        validateAssumptionEnvelope(validateEnvelopeSchema.parse(input), runtimeConfig) as Promise<ToolResult>,
    },
  ];

  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: TOOL_CATALOG_BY_NAME[tool.name]?.summary ?? tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((candidate) => candidate.name === request.params.name);

    if (!tool) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    const result = await tool.execute(request.params.arguments ?? {});

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      structuredContent: result,
    };
  });

  return server;
}

export function createServer(importMetaUrl: string) {
  return createServerFromDependencies(createServerDependencies(importMetaUrl));
}
