import { z } from "zod";

export const validateTaskHeaderSchema = z.object({
  taskId: z.string().min(1),
  taskType: z.string().min(1),
  category: z.string().min(1),
  specMapping: z.string().min(1),
  coreOrNonCore: z.string().min(1),
  formalArtifactExpected: z.string().optional().default(""),
  benchmarkImpact: z.string().min(1),
  claimBoundary: z.string().min(1),
});

export async function validateTaskHeader(input: z.infer<typeof validateTaskHeaderSchema>, categories: string[]) {
  const normalizedHeader = {
    ...input,
    taskType: input.taskType.trim(),
    category: input.category.trim(),
    coreOrNonCore: input.coreOrNonCore.trim(),
    formalArtifactExpected: input.formalArtifactExpected.trim(),
    specMapping: input.specMapping.trim(),
    benchmarkImpact: input.benchmarkImpact.trim(),
    claimBoundary: input.claimBoundary.trim(),
  };

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!["Implementation", "Testing", "Integration"].includes(normalizedHeader.taskType)) {
    errors.push("taskType must be one of: Implementation, Testing, Integration");
  }

  if (!categories.includes(normalizedHeader.category)) {
    errors.push(`category must be one of the configured engine categories`);
  }

  if (!/Section\s+(?:1[0-3]|[1-9])\b/.test(normalizedHeader.specMapping)) {
    errors.push("specMapping must reference a section number between 1 and 13");
  }

  if (!["Core", "Non-Core"].includes(normalizedHeader.coreOrNonCore)) {
    errors.push("coreOrNonCore must be Core or Non-Core");
  }

  if (!normalizedHeader.claimBoundary) {
    errors.push("claimBoundary must not be empty");
  }

  if (normalizedHeader.coreOrNonCore === "Core" && !normalizedHeader.formalArtifactExpected) {
    errors.push("formalArtifactExpected must not be empty for Core tasks");
  }

  if (normalizedHeader.coreOrNonCore === "Non-Core" && normalizedHeader.category === "documentation") {
    warnings.push("documentation tasks are non-core and should avoid engine-capability claims");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedHeader,
  };
}
