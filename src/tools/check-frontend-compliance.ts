import fs from "node:fs/promises";
// @ts-ignore
import { glob } from "glob";
import { z } from "zod";
import { scanFrontendCompliance } from "../utils/ast-scanner.js";

export const checkFrontendComplianceSchema = z.object({
  targetPath: z.string(),
  glob: z.string().optional().default("**/*.tsx"),
});

export async function checkFrontendCompliance(input: z.infer<typeof checkFrontendComplianceSchema>) {
  const { targetPath, glob: globPattern } = input;
  
  // Use glob.sync or glob promise to find files
  const files = await glob(globPattern, { cwd: targetPath, absolute: true, ignore: "**/node_modules/**" });

  let totalIssues = 0;
  const reports = [];

  for (const file of files) {
    try {
      const code = await fs.readFile(file, "utf-8");
      const report = scanFrontendCompliance(code, file);
      if (report.issues.length > 0) {
        totalIssues += report.issues.length;
        reports.push(report);
      }
    } catch(err) {
      console.error(`Error processing file ${file}`, err);
    }
  }

  // Calculate generic score based on issues
  const astScore = Math.max(0, 100 - (totalIssues * 5));

  return {
    compliant: totalIssues === 0,
    totalIssues,
    astScore,
    aestheticCompliance: totalIssues === 0 ? "passing" : "failing",
    scannedFiles: files.length,
    reports
  };
}
