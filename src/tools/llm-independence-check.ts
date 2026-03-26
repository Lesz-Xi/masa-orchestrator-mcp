import fs from "node:fs";

import { z } from "zod";

import { collectFiles, scanContentForPattern } from "../adapters/file-scanner.js";
import { classifyFile } from "../classification/path-classifier.js";
import { llmPatterns } from "../rules/llm-rules.js";
import type { RuntimeConfig } from "../types.js";

export const llmIndependenceSchema = z.object({
  enginePath: z.string().min(1),
  excludePaths: z.array(z.string()).optional().default([]),
});

export async function llmIndependenceCheck(
  input: z.infer<typeof llmIndependenceSchema>,
  runtimeConfig: RuntimeConfig
) {
  const files = await collectFiles(input.enginePath, "**/*.ts", {
    allowedRoots: runtimeConfig.allowedScanRoots,
  });
  const violations: Array<{
    file: string;
    line: number;
    pattern: string;
    context: string;
    inEnginePath: boolean;
  }> = [];
  const engineFiles = new Set<string>();
  const explanationFiles = new Set<string>();
  const unclassifiedFiles = new Set<string>();

  for (const file of files) {
    if (input.excludePaths.some((exclude) => file.includes(exclude))) {
      continue;
    }

    const content = await fs.promises.readFile(file, "utf8");
    const fileClass = classifyFile({ filePath: file, engineRoot: runtimeConfig.engineRoot, content });

    if (fileClass === "engine-core") engineFiles.add(file);
    else if (fileClass === "support" || fileClass === "legacy-fallback") explanationFiles.add(file);
    else unclassifiedFiles.add(file);

    for (const pattern of llmPatterns) {
      const matches = scanContentForPattern({
        filePath: file,
        content,
        pattern: new RegExp(pattern.source, "gi"),
        fileClass,
      });
      for (const match of matches) {
        violations.push({
          file,
          line: match.line,
          pattern: pattern.source,
          context: match.surrounding,
          inEnginePath: fileClass === "engine-core",
        });
      }
    }
  }

  return {
    independent: !violations.some((violation) => violation.inEnginePath),
    violations,
    engineFiles: Array.from(engineFiles).sort((left, right) => left.localeCompare(right)),
    explanationFiles: Array.from(explanationFiles).sort((left, right) => left.localeCompare(right)),
    unclassifiedFiles: Array.from(unclassifiedFiles).sort((left, right) => left.localeCompare(right)),
  };
}
