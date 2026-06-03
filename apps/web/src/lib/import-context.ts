export type ImportContextType = "openapi" | "jira" | "prd" | "text";

export interface ImportContext {
  type: ImportContextType;
  label: string;
  truncated?: boolean;
}

const MAX_IMPORT_BYTES = 1_000_000;

export const IMPORT_CONTEXT_STORAGE_KEY = "architectai-import-context";

export function parseImportContext(text: string): ImportContext | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (trimmed.length > MAX_IMPORT_BYTES) {
    return { type: "text", label: "Import context (truncated)", truncated: true };
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes('"openapi"') || lower.includes("openapi:") || lower.includes('"paths"')) {
    return { type: "openapi", label: "OpenAPI spec attached" };
  }
  if (lower.includes("jira") || lower.includes('"issues"')) {
    return { type: "jira", label: "Jira context attached" };
  }
  if (lower.includes("prd") || lower.includes("product requirements")) {
    return { type: "prd", label: "PRD excerpt attached" };
  }
  if (trimmed.length >= 40) {
    return { type: "text", label: "Additional context attached" };
  }
  return null;
}

export function loadStoredImportContext(): ImportContext | null {
  try {
    const raw = sessionStorage.getItem(IMPORT_CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImportContext;
  } catch {
    return null;
  }
}

export function storeImportContext(ctx: ImportContext): void {
  sessionStorage.setItem(IMPORT_CONTEXT_STORAGE_KEY, JSON.stringify(ctx));
}

export function clearStoredImportContext(): void {
  sessionStorage.removeItem(IMPORT_CONTEXT_STORAGE_KEY);
}
