import type { NotationRule, ScanMatch, ToolViolation } from "../types.js";

export function applyNotationRules(input: {
  rules: NotationRule[];
  matchesByRule: Array<{ rule: NotationRule; matches: ScanMatch[] }>;
  scope: string;
}): ToolViolation[] {
  const violations: ToolViolation[] = [];

  for (const { rule, matches } of input.matchesByRule) {
    if (!rule.scopes.includes(input.scope) && !rule.scopes.includes("all")) {
      continue;
    }

    for (const match of matches) {
      if (!rule.includeClasses.includes(match.fileClass)) {
        continue;
      }

      let severity = rule.severity;
      if (rule.downgradeInClasses?.includes(match.fileClass)) {
        severity = "warning";
      }

      if (rule.contextCheck && (match.context === "comment" || match.context === "jsdoc")) {
        severity = "warning";
      }

      violations.push({
        file: match.file,
        line: match.line,
        column: match.column,
        match: match.match,
        pattern: rule.pattern,
        severity,
        message: rule.message,
        suggestion: rule.suggestion,
      });
    }
  }

  return violations.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column
  );
}
