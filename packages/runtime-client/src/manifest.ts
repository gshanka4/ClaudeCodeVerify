import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface LocalManifest {
  architectureId?: string;
  name?: string;
  version?: number;
  trustGrade?: number;
  verificationRunId?: string;
  trustGradeBreakdown?: unknown;
  [key: string]: unknown;
}

export async function loadLocalManifest(repoRoot: string): Promise<LocalManifest | null> {
  const path = join(repoRoot, ".architectai", "manifest.json");
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as LocalManifest;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export function trustGradeFromManifest(manifest: LocalManifest | null): {
  trustGrade: number | null;
  verificationRunId: string | null;
  architectureId: string | null;
  name: string | null;
  version: number | null;
} {
  if (!manifest) {
    return {
      trustGrade: null,
      verificationRunId: null,
      architectureId: null,
      name: null,
      version: null,
    };
  }
  return {
    trustGrade:
      typeof manifest.trustGrade === "number" ? manifest.trustGrade : null,
    verificationRunId:
      typeof manifest.verificationRunId === "string"
        ? manifest.verificationRunId
        : null,
    architectureId:
      typeof manifest.architectureId === "string" ? manifest.architectureId : null,
    name: typeof manifest.name === "string" ? manifest.name : null,
    version: typeof manifest.version === "number" ? manifest.version : null,
  };
}
