import path from "node:path";
import { existsSync } from "node:fs";

export function packageRootFrom(importMetaUrl: string): string {
  return findPackageRoot(path.dirname(new URL(importMetaUrl).pathname));
}

export function ensureAbsolute(inputPath: string, baseDir: string): string {
  return path.isAbsolute(inputPath) ? path.normalize(inputPath) : path.resolve(baseDir, inputPath);
}

export function findPackageRoot(start: string): string {
  let current = path.resolve(start);

  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "package.json"))) {
      return current;
    }
    current = path.dirname(current);
  }

  return path.resolve(start);
}
