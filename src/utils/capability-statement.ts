export function buildHonestCapabilityStatement(input: {
  passing: number;
  codeExists: boolean;
  llmIndependent: boolean;
  notationCompliant: boolean;
  blockers: string[];
}): string {
  const { passing, codeExists, llmIndependent, notationCompliant, blockers } = input;

  if (!codeExists && passing === 0) {
    return "No computation implemented. The engine does not yet exist.";
  }

  if (codeExists && passing === 0) {
    return "Engine code exists but no benchmarks pass. Unvalidated prototype.";
  }

  if (passing > 0 && passing < 6) {
    return `Partially validated: ${passing}/6 benchmarks pass.`;
  }

  if (passing === 6 && (!llmIndependent || !notationCompliant)) {
    return "WARNING: All benchmarks pass but compliance gates are not fully satisfied. Not consolidation-ready.";
  }

  if (passing === 6 && blockers.length > 0) {
    return "All 6 benchmarks pass locally, but unresolved L4 blockers prevent v1.0 completion claims.";
  }

  if (passing === 6) {
    return "v1.0 complete: deterministic intervention executor, all 6 benchmarks pass.";
  }

  return "Status unknown.";
}
