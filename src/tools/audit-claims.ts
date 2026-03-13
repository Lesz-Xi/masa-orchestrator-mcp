import fs from "node:fs";

import { z } from "zod";

import { collectFiles, scanContentForPattern } from "../adapters/file-scanner.js";
import { classifyFile } from "../classification/path-classifier.js";
import { overclaimRules } from "../rules/claim-rules.js";
import type { ClaimFinding, RuntimeConfig } from "../types.js";

export const auditClaimsSchema = z.object({
  path: z.string().min(1),
  target: z.enum(["code-comments", "function-names", "variable-names", "jsdoc", "all"]),
  benchmarksPassing: z.number().int().min(0).max(6),
});

function findingMatchesTarget(target: string, findingType: ClaimFinding["type"]): boolean {
  if (target === "all") return true;
  if (target === "code-comments") return findingType === "comment";
  if (target === "jsdoc") return findingType === "jsdoc";
  if (target === "function-names") return findingType === "function-name";
  return findingType === "variable-name";
}

export async function auditClaims(
  input: z.infer<typeof auditClaimsSchema>,
  runtimeConfig: RuntimeConfig
) {
  const files = await collectFiles(input.path, "**/*.{ts,tsx,md}");
  const overclaims: ClaimFinding[] = [];
  const trackACore = new Set<string>();
  const trackBSupport = new Set<string>();
  const unclassified = new Set<string>();

  for (const file of files) {
    const content = await fs.promises.readFile(file, "utf8");
    const fileClass = classifyFile({ filePath: file, engineRoot: runtimeConfig.engineRoot, content });
    if (fileClass === "engine-core") trackACore.add(file);
    else if (fileClass === "support" || fileClass === "legacy-fallback" || fileClass === "docs" || fileClass === "tests") trackBSupport.add(file);
    else unclassified.add(file);

    for (const rule of overclaimRules) {
      if (
        typeof rule.applyWhenBenchmarksLessThan === "number" &&
        input.benchmarksPassing >= rule.applyWhenBenchmarksLessThan
      ) {
        continue;
      }

      const matches = scanContentForPattern({
        filePath: file,
        content,
        pattern: new RegExp(rule.pattern.source, "gi"),
        fileClass,
      });

      for (const match of matches) {
        let type = rule.type;
        if (type === "function-name" && !/\bfunction\b|=>/.test(match.lineText)) {
          continue;
        }
        if (type === "variable-name" && !/\bconst\b|\blet\b|\bvar\b/.test(match.lineText)) {
          continue;
        }
        if (type === "comment" && !(match.context === "comment" || match.context === "string")) {
          continue;
        }
        if (type === "jsdoc" && match.context !== "jsdoc") {
          continue;
        }
        if (!findingMatchesTarget(input.target, type)) {
          continue;
        }

        overclaims.push({
          file,
          line: match.line,
          type,
          current: match.match,
          problem: rule.problem,
          suggestion: rule.suggestion,
          severity: rule.severity,
        });
      }
    }
  }

  overclaims.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);

  return {
    clean: !overclaims.some((claim) => claim.severity === "error"),
    overclaims,
    trackClassification: {
      trackA_core: Array.from(trackACore).sort((left, right) => left.localeCompare(right)),
      trackB_support: Array.from(trackBSupport).sort((left, right) => left.localeCompare(right)),
      unclassified: Array.from(unclassified).sort((left, right) => left.localeCompare(right)),
    },
  };
}
