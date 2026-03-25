import ts from "typescript";

export interface ComplianceResult {
  file: string;
  issues: string[];
}

export function scanFrontendCompliance(sourceCode: string, filePath: string): ComplianceResult {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const issues: string[] = [];
  let hasFramerMotion = false;
  let hasMotionDiv = false;

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.getText();
      if (moduleSpecifier.includes("framer-motion")) {
        hasFramerMotion = true;
      }
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText();
      if (tagName === "motion.div" || tagName.startsWith("motion.")) {
        hasMotionDiv = true;
      }

      // Check for className attribute
      const attributes = node.attributes.properties;
      for (const attr of attributes) {
        if (ts.isJsxAttribute(attr) && attr.name.getText() === "className") {
          const init = attr.initializer;
          let classNameString = "";
          
          if (init && ts.isStringLiteral(init)) {
            classNameString = init.text;
          } else if (init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)) {
            classNameString = init.expression.text;
          } else if (init && ts.isJsxExpression(init) && init.expression && ts.isTemplateExpression(init.expression)) {
            // roughly try to just read the raw text of the template expression
            classNameString = init.expression.getText();
          }

          if (classNameString) {
            // Absolute bounds vs Responsive guards
            if (classNameString.match(/\bw-\[\d+px\]/) && !classNameString.includes('max-w-') && !classNameString.includes('lg:w-') && !classNameString.includes('md:w-')) {
              issues.push(`Responsive Integrity Violation: Found rigid absolute bounds (${classNameString.match(/\bw-\[\d+px\]/)?.[0]}) without responsive guards.`);
            }

            // Dark Mode Parity violations
            if (classNameString.match(/\bbg-white\b|\bbg-gray-\d+\b|\bborder-gray-\d+\b/) && !classNameString.includes('dark:')) {
              issues.push(`Dark Mode Parity Violation: Explicit light mode color found in container without a dark: variant.`);
            }

            // Z-index overlap prevention
            if (classNameString.includes('absolute ') && classNameString.includes('z-') && !classNameString.includes('lg:relative')) {
              issues.push(`Overlap Prevention: Absolute positioned element with z-index found. Ensure it does not collide with sidebars or hamburger menus.`);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Example Aesthetic Rule: Complex interactive files (with a lot of UI) should use framer motion.
  // We'll just flag if there are no motion divs in an interactive component, but that's hard to guess.
  // Let's stick to the specific TS ast rules we defined.

  return {
    file: filePath,
    issues
  };
}
