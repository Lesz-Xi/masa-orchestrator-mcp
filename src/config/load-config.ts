import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { BenchmarkMapConfig, NotationRule, RuntimeConfig } from "../types.js";
import { ensureAbsolute, packageRootFrom } from "../utils/paths.js";

const notationRuleSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  severity: z.enum(["error", "warning"]),
  message: z.string().min(1),
  suggestion: z.string().min(1),
  scopes: z.array(z.string().min(1)).min(1),
  includeClasses: z.array(
    z.enum(["engine-core", "support", "legacy-fallback", "tests", "docs", "migrations", "unclassified"])
  ),
  downgradeInClasses: z
    .array(z.enum(["engine-core", "support", "legacy-fallback", "tests", "docs", "migrations", "unclassified"]))
    .optional(),
  contextCheck: z.boolean().optional(),
});

const notationConfigSchema = z.object({
  rules: z.array(notationRuleSchema),
});

const categoriesConfigSchema = z.object({
  categories: z.array(z.string().min(1)),
});

const benchmarkConfigSchema: z.ZodType<BenchmarkMapConfig> = z.object({
  suite: z.string().min(1),
  testFile: z.string().min(1),
  benchmarks: z.array(
    z.object({
      id: z.enum(["B1", "B2", "B3", "B4", "B5", "B6"]),
      name: z.string().min(1),
      expectedValue: z.number(),
    })
  ),
});

const runtimeEnvSchema = z.object({
  AUDIT_ROOT: z.string().min(1, "AUDIT_ROOT is required."),
  ENGINE_ROOT: z.string().min(1, "ENGINE_ROOT is required."),
  STATE_FILE: z.string().optional(),
  BENCHMARK_TEST_PATH: z.string().optional(),
  MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
  MCP_HOST: z.string().min(1).default("127.0.0.1"),
  MCP_PORT: z.coerce.number().int().positive().default(3100),
  MCP_PATH: z.string().min(1).default("/mcp"),
});

function readJsonFile<T>(filePath: string, schema: z.ZodType<T>): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return schema.parse(JSON.parse(raw));
}

export function loadRuntimeConfig(importMetaUrl: string): RuntimeConfig {
  void importMetaUrl;
  const parsed = runtimeEnvSchema.parse(process.env);

  const resolvedAuditRoot = ensureAbsolute(parsed.AUDIT_ROOT, process.cwd());
  const resolvedEngineRoot = ensureAbsolute(parsed.ENGINE_ROOT, process.cwd());
  const workspaceRoot = path.dirname(resolvedAuditRoot);
  const normalizedPath = parsed.MCP_PATH.startsWith("/") ? parsed.MCP_PATH : `/${parsed.MCP_PATH}`;

  return {
    auditRoot: resolvedAuditRoot,
    engineRoot: resolvedEngineRoot,
    stateFile: ensureAbsolute(
      parsed.STATE_FILE || path.join(resolvedAuditRoot, ".orchestration-state.json"),
      process.cwd()
    ),
    benchmarkTestPath: parsed.BENCHMARK_TEST_PATH
      ? ensureAbsolute(parsed.BENCHMARK_TEST_PATH, process.cwd())
      : undefined,
    transport: parsed.MCP_TRANSPORT,
    host: parsed.MCP_HOST,
    port: parsed.MCP_PORT,
    path: normalizedPath,
    workspaceRoot,
  };
}

export function loadNotationRules(importMetaUrl: string): NotationRule[] {
  const packageRoot = packageRootFrom(importMetaUrl);
  const configPath = path.join(packageRoot, "config", "notation-rules.json");
  return readJsonFile(configPath, notationConfigSchema).rules;
}

export function loadEngineCategories(importMetaUrl: string): string[] {
  const packageRoot = packageRootFrom(importMetaUrl);
  const configPath = path.join(packageRoot, "config", "engine-categories.json");
  return readJsonFile(configPath, categoriesConfigSchema).categories;
}

export function loadBenchmarkMap(importMetaUrl: string): BenchmarkMapConfig {
  const packageRoot = packageRootFrom(importMetaUrl);
  const configPath = path.join(packageRoot, "config", "benchmark-map.json");
  return readJsonFile(configPath, benchmarkConfigSchema);
}
