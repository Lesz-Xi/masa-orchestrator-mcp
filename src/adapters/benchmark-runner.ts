import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { BenchmarkDefinition, BenchmarkMapConfig, BenchmarkResult, BenchmarkStatusSnapshot, RuntimeConfig } from "../types.js";
import { buildHonestCapabilityStatement } from "../utils/capability-statement.js";
import { findPackageRoot } from "../utils/paths.js";

const execFileAsync = promisify(execFile);

function emptyBenchmarks(definitions: BenchmarkDefinition[]): Record<BenchmarkDefinition["id"], BenchmarkResult> {
  return Object.fromEntries(
    definitions.map((definition) => [
      definition.id,
      {
        status: "not_implemented",
        expectedValue: definition.expectedValue,
      },
    ])
  ) as Record<BenchmarkDefinition["id"], BenchmarkResult>;
}

function inferStatus(stdout: string, definition: BenchmarkDefinition): BenchmarkResult {
  const escaped = definition.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const passPattern = new RegExp(`✓[\\s\\S]*${escaped}`);
  const failPattern = new RegExp(`(×|FAIL)[\\s\\S]*${escaped}`);

  if (passPattern.test(stdout)) {
    return {
      status: "passing",
      expectedValue: definition.expectedValue,
      actualValue: definition.expectedValue,
      lastRun: new Date().toISOString(),
    };
  }

  if (failPattern.test(stdout)) {
    return {
      status: "failing",
      expectedValue: definition.expectedValue,
      errorMessage: "Benchmark test failed.",
      lastRun: new Date().toISOString(),
    };
  }

  return {
    status: "not_implemented",
    expectedValue: definition.expectedValue,
    lastRun: new Date().toISOString(),
  };
}

export async function runBenchmarks(input: {
  runtimeConfig: RuntimeConfig;
  benchmarkMap: BenchmarkMapConfig;
  llmIndependence: "verified" | "violation" | "unchecked";
  notationCompliance: "compliant" | "violation" | "unchecked";
  frontendCompliance?: "passing" | "failing" | "unchecked";
  blockers: string[];
}): Promise<BenchmarkStatusSnapshot> {
  const packageRoot = findPackageRoot(input.runtimeConfig.engineRoot);
  const benchmarkFile =
    input.runtimeConfig.benchmarkTestPath ||
    path.join(packageRoot, input.benchmarkMap.testFile);

  const safeEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: process.env.NODE_ENV,
    TMPDIR: process.env.TMPDIR,
    TMP: process.env.TMP,
    TEMP: process.env.TEMP,
    // npm/node runtime vars needed for npx/vitest
    npm_execpath: process.env.npm_execpath,
    npm_config_prefix: process.env.npm_config_prefix,
    npm_config_cache: process.env.npm_config_cache,
  };

  const executionResult = await execFileAsync(
    "npx",
    ["vitest", "run", benchmarkFile, "--reporter=verbose"],
    {
      cwd: packageRoot,
      maxBuffer: 10 * 1024 * 1024,
      env: safeEnv,
    }
  );

  const stdout =
    typeof executionResult === "string" ? executionResult : executionResult.stdout;
  const stderr =
    typeof executionResult === "string" ? "" : executionResult.stderr;
  const output = `${stdout}\n${stderr}`;
  const benchmarks = emptyBenchmarks(input.benchmarkMap.benchmarks);

  for (const definition of input.benchmarkMap.benchmarks) {
    benchmarks[definition.id] = inferStatus(output, definition);
  }

  const passing = Object.values(benchmarks).filter((result) => result.status === "passing").length;
  const failing = Object.values(benchmarks).filter((result) => result.status === "failing").length;
  const notImplemented = Object.values(benchmarks).filter(
    (result) => result.status === "not_implemented"
  ).length;

  const honestCapabilityStatement = buildHonestCapabilityStatement({
    passing,
    codeExists: true,
    llmIndependent: input.llmIndependence === "verified",
    notationCompliant: input.notationCompliance === "compliant",
    blockers: input.blockers,
  });

  return {
    passing,
    failing,
    notImplemented,
    benchmarks,
    llmIndependence: input.llmIndependence,
    notationCompliance: input.notationCompliance,
    frontendCompliance: input.frontendCompliance ?? "unchecked",
    honestCapabilityStatement,
    consolidationEligible:
      passing === 6 &&
      failing === 0 &&
      notImplemented === 0 &&
      input.llmIndependence === "verified" &&
      input.notationCompliance === "compliant" &&
      input.blockers.length === 0,
    updatedAt: new Date().toISOString(),
  };
}
