import fs from "node:fs";
import path from "node:path";

// @ts-ignore
import { glob } from "glob";

import type { FileClass, MatchContext, ScanMatch } from "../types.js";
import { classifyFile } from "../classification/path-classifier.js";

interface CommentState {
  inBlockComment: boolean;
  inJsDoc: boolean;
}

function countOpenQuotes(segment: string, quote: string): number {
  let count = 0;
  for (let index = 0; index < segment.length; index += 1) {
    if (segment[index] === quote && segment[index - 1] !== "\\") {
      count += 1;
    }
  }
  return count;
}

function detectContext(line: string, matchIndex: number, state: CommentState): MatchContext {
  if (state.inBlockComment) {
    return state.inJsDoc ? "jsdoc" : "comment";
  }

  const before = line.slice(0, matchIndex);
  const commentIndex = before.indexOf("//");
  if (commentIndex >= 0) {
    return "comment";
  }

  const singleCount = countOpenQuotes(before, "'");
  const doubleCount = countOpenQuotes(before, "\"");
  const tickCount = countOpenQuotes(before, "`");
  if (singleCount % 2 === 1 || doubleCount % 2 === 1 || tickCount % 2 === 1) {
    return "string";
  }

  return "code";
}

function advanceCommentState(line: string, previous: CommentState): CommentState {
  let state = { ...previous };
  const trimmed = line.trim();

  if (!state.inBlockComment) {
    const start = line.indexOf("/*");
    if (start >= 0) {
      const end = line.indexOf("*/", start + 2);
      if (end < 0) {
        state.inBlockComment = true;
        state.inJsDoc = trimmed.startsWith("/**");
      }
    }
  } else {
    const end = line.indexOf("*/");
    if (end >= 0) {
      state = { inBlockComment: false, inJsDoc: false };
    }
  }

  return state;
}

export function assertSandboxedPath(
  targetPath: string,
  auditRoot: string,
  engineRoot: string
): void {
  const resolved = path.resolve(targetPath);
  const resolvedAudit = path.resolve(auditRoot);
  const resolvedEngine = path.resolve(engineRoot);

  const inAudit =
    resolved === resolvedAudit || resolved.startsWith(resolvedAudit + path.sep);
  const inEngine =
    resolved === resolvedEngine || resolved.startsWith(resolvedEngine + path.sep);

  if (!inAudit && !inEngine) {
    throw new Error(
      `Path '${resolved}' is outside the sandboxed AUDIT_ROOT ('${resolvedAudit}') and ENGINE_ROOT ('${resolvedEngine}'). Access denied.`
    );
  }
}

export async function collectFiles(targetPath: string, globPattern = "**/*.ts", sandbox?: { auditRoot: string; engineRoot: string }): Promise<string[]> {
  if (sandbox) {
    assertSandboxedPath(targetPath, sandbox.auditRoot, sandbox.engineRoot);
  }
  const stats = await fs.promises.stat(targetPath);

  if (stats.isFile()) {
    return [targetPath];
  }

  const files = await glob(globPattern, {
    cwd: targetPath,
    absolute: true,
    nodir: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  });

  return files.sort((left: string, right: string) => left.localeCompare(right));
}

export async function scanFileForPattern(input: {
  filePath: string;
  pattern: RegExp;
  engineRoot: string;
}): Promise<ScanMatch[]> {
  const content = await fs.promises.readFile(input.filePath, "utf8");
  const fileClass = classifyFile({
    filePath: input.filePath,
    engineRoot: input.engineRoot,
    content,
  });

  return scanContentForPattern({
    filePath: input.filePath,
    content,
    pattern: input.pattern,
    fileClass,
  });
}

export function scanContentForPattern(input: {
  filePath: string;
  content: string;
  pattern: RegExp;
  fileClass: FileClass;
}): ScanMatch[] {
  const lines = input.content.split(/\r?\n/);
  let state: CommentState = { inBlockComment: false, inJsDoc: false };
  const matches: ScanMatch[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const regex = new RegExp(input.pattern.source, input.pattern.flags.includes("g") ? input.pattern.flags : `${input.pattern.flags}g`);
    let result: RegExpExecArray | null;

    while ((result = regex.exec(line)) !== null) {
      const context = detectContext(line, result.index, state);
      const start = Math.max(0, lineIndex - 1);
      const end = Math.min(lines.length, lineIndex + 2);
      matches.push({
        file: input.filePath,
        line: lineIndex + 1,
        column: result.index + 1,
        lineText: line,
        match: result[0],
        context,
        fileClass: input.fileClass,
        surrounding: lines.slice(start, end).join("\n"),
      });
    }

    state = advanceCommentState(line, state);
  }

  return matches;
}
