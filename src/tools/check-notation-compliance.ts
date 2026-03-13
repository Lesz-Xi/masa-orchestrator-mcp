import { z } from "zod";

import { collectFiles, scanFileForPattern } from "../adapters/file-scanner.js";
import type { NotationRule, RuntimeConfig, ToolViolation } from "../types.js";
import { applyNotationRules } from "../rules/rule-engine.js";

export const checkNotationSchema = z.object({
  path: z.string().min(1),
  glob: z.string().optional().default("**/*.ts"),
  scope: z.enum(["v1.0-engine", "v1.1-deferred", "all"]),
});

export async function checkNotationCompliance(
  input: z.infer<typeof checkNotationSchema>,
  runtimeConfig: RuntimeConfig,
  rules: NotationRule[]
) {
  const files = await collectFiles(input.path, input.glob);
  const matchesByRule: Array<{ rule: NotationRule; matches: Awaited<ReturnType<typeof scanFileForPattern>> }> = [];

  for (const rule of rules) {
    const pattern = new RegExp(rule.pattern, "gi");
    const allMatches = [];
    for (const file of files) {
      const matches = await scanFileForPattern({
        filePath: file,
        pattern,
        engineRoot: runtimeConfig.engineRoot,
      });
      allMatches.push(...matches);
    }
    matchesByRule.push({ rule, matches: allMatches });
  }

  const violations: ToolViolation[] = applyNotationRules({
    rules,
    matchesByRule,
    scope: input.scope,
  });

  return {
    compliant: !violations.some((violation) => violation.severity === "error"),
    totalFiles: files.length,
    filesScanned: files.length,
    violations,
    summary: {
      errors: violations.filter((violation) => violation.severity === "error").length,
      warnings: violations.filter((violation) => violation.severity === "warning").length,
    },
  };
}
