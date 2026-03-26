import fs from "node:fs";

import { z } from "zod";

import { collectFiles, scanContentForPattern } from "../adapters/file-scanner.js";
import { classifyFile } from "../classification/path-classifier.js";
import { envelopeRules } from "../rules/envelope-rules.js";
import type { RuntimeConfig } from "../types.js";

export const validateEnvelopeSchema = z.object({
  path: z.string().min(1),
});

export async function validateAssumptionEnvelope(
  input: z.infer<typeof validateEnvelopeSchema>,
  runtimeConfig: RuntimeConfig
) {
  const files = await collectFiles(input.path, "**/*.ts", {
    allowedRoots: runtimeConfig.allowedScanRoots,
  });
  const violations: Array<{
    file: string;
    line: number;
    category: "hidden_confounders" | "nonlinear" | "distributional" | "cyclic" | "semi_markovian";
    match: string;
    severity: "error" | "warning";
    message: string;
    recommendation: string;
  }> = [];

  for (const file of files) {
    const content = await fs.promises.readFile(file, "utf8");
    const fileClass = classifyFile({ filePath: file, engineRoot: runtimeConfig.engineRoot, content });
    if (fileClass !== "engine-core") {
      continue;
    }

    for (const rule of envelopeRules) {
      for (const pattern of rule.patterns) {
        const matches = scanContentForPattern({ filePath: file, content, pattern: new RegExp(pattern.source, "gi"), fileClass });
        for (const match of matches) {
          let severity = rule.severity;
          if (match.context === "comment" || match.context === "jsdoc") {
            severity = "warning";
          }
          violations.push({
            file,
            line: match.line,
            category: rule.id as "hidden_confounders" | "nonlinear" | "distributional" | "cyclic" | "semi_markovian",
            match: match.match,
            severity,
            message: rule.message,
            recommendation: rule.recommendation,
          });
        }
      }
    }
  }

  return {
    withinEnvelope: !violations.some((violation) => violation.severity === "error"),
    violations,
  };
}
