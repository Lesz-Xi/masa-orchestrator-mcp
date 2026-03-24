import { describe, it, expect } from "vitest";
import { scanFrontendCompliance } from "../src/utils/ast-scanner.js";

describe("Frontend AST Scanner", () => {
  it("flags missing dark mode variants and missing responsive bounds", () => {
    const code = `
      export function Dashboard() {
        return (
          <div className="w-[380px] bg-white absolute z-50">
            <h1>Hello Wabi-Sabi</h1>
          </div>
        )
      }
    `;

    const result = scanFrontendCompliance(code, "page.tsx");
    
    expect(result.issues.length).toBeGreaterThan(0);
    
    const issuesText = result.issues.join(" ");
    expect(issuesText).toContain("Responsive Integrity");
    expect(issuesText).toContain("Dark Mode");
    expect(issuesText).toContain("Overlap Prevention");
  });

  it("passes compliant components", () => {
    const code = `
      import { motion } from "framer-motion";
      export function GoodDashboard() {
        return (
          <motion.div className="w-full lg:w-[380px] dark:bg-black bg-zinc-900 lg:relative z-20 backdrop-blur radial-gradient">
            <h1>Compliance Met</h1>
          </motion.div>
        )
      }
    `;

    const result = scanFrontendCompliance(code, "good-page.tsx");
    
    expect(result.issues).toEqual([]);
  });
});
