import type { AutoFixStrategy, CodeDiff } from "@architectai/shared";
import type { AutofixInput } from "./types";

/**
 * Mustache-style template renderer → valid CodeDiff (P5-UT-02).
 * Templates use {{filePath}} and {{line}} placeholders.
 */
export function renderAutofix(input: AutofixInput): CodeDiff {
  const line = input.fileContent.split("\n").findIndex((l) => l.includes("import")) + 1 || 1;
  const rendered = input.template
    .replace(/\{\{filePath\}\}/g, input.filePath)
    .replace(/\{\{line\}\}/g, String(line));

  return {
    filePath: input.filePath,
    linesChanged: 2,
    driftScoreDelta: -10,
    hunks: [
      {
        lineStart: line,
        removed: ["// violation line"],
        added: [rendered, `// ${input.description}`],
      },
    ],
  };
}

export function autofixFromStrategy(
  filePath: string,
  fileContent: string,
  strategy: AutoFixStrategy | null,
  ruleCode: string,
): CodeDiff | null {
  if (!strategy) return null;
  return renderAutofix({
    ruleCode,
    filePath,
    fileContent,
    template: strategy.diffTemplate || "// autofix applied for {{filePath}}",
    description: strategy.description,
  });
}
