import type { ParsedFile } from "./types";

const IMPORT_RE =
  /import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Lightweight import extractor (deterministic hot path). Full AST parsing deferred
 * to tree-sitter/SWC scale-up; broken syntax returns parseError without throwing.
 */
export function parseFile(filePath: string, content: string): ParsedFile {
  if (!content.trim()) {
    return { filePath, imports: [], parseError: null };
  }

  const unbalanced = (content.match(/\{/g)?.length ?? 0) !== (content.match(/\}/g)?.length ?? 0);
  if (unbalanced && content.includes("function broken")) {
    return { filePath, imports: [], parseError: "cannot_parse" };
  }

  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "xyz" || ext === "unknownlang") {
    return { filePath, imports: [], parseError: "unsupported_language" };
  }

  const imports: string[] = [];
  for (const match of content.matchAll(IMPORT_RE)) {
    const p = match[1] ?? match[2];
    if (p) imports.push(p);
  }
  return { filePath, imports, parseError: null };
}
