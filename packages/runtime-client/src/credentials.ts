import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ArchitectAiCredentials {
  apiBaseUrl: string;
  workspaceToken: string;
  architectureId: string;
  monitoredPaths?: string[];
  ignoredPaths?: string[];
}

const DEFAULT_IGNORED = ["node_modules/", "dist/", ".git/", "coverage/"];

export function defaultIgnoredPaths(): string[] {
  return [...DEFAULT_IGNORED];
}

function parseCredentialsJson(raw: string, source: string): ArchitectAiCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${source}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid credentials object in ${source}`);
  }
  const o = parsed as Record<string, unknown>;
  const apiBaseUrl = String(o.apiBaseUrl ?? "").trim();
  const workspaceToken = String(o.workspaceToken ?? "").trim();
  const architectureId = String(o.architectureId ?? "").trim();
  if (!apiBaseUrl || !workspaceToken || !architectureId) {
    throw new Error(
      `${source} must include apiBaseUrl, workspaceToken, and architectureId`,
    );
  }
  return {
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ""),
    workspaceToken,
    architectureId,
    monitoredPaths: Array.isArray(o.monitoredPaths)
      ? o.monitoredPaths.map(String)
      : undefined,
    ignoredPaths: Array.isArray(o.ignoredPaths)
      ? o.ignoredPaths.map(String)
      : undefined,
  };
}

/** Resolve credentials: env vars override file in repo root. */
export async function loadCredentials(
  repoRoot: string,
): Promise<ArchitectAiCredentials | null> {
  const envUrl = process.env.ARCHITECTAI_API_URL?.trim();
  const envToken = process.env.ARCHITECTAI_WORKSPACE_TOKEN?.trim();
  const envArch = process.env.ARCHITECTAI_ARCHITECTURE_ID?.trim();
  if (envUrl && envToken && envArch) {
    return {
      apiBaseUrl: envUrl.replace(/\/$/, ""),
      workspaceToken: envToken,
      architectureId: envArch,
    };
  }

  const credPath = join(repoRoot, ".architectai", "credentials.json");
  try {
    const raw = await readFile(credPath, "utf8");
    return parseCredentialsJson(raw, credPath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
