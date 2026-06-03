import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CLAUDE_CODE_BASELINE_HEADER } from "@architectai/shared";

export type ClaudeCodeFileMap = Record<string, string>;

export interface ApplyBundleOptions {
  repoRoot: string;
  files: ClaudeCodeFileMap;
  /** If true, skip overwriting existing CLAUDE.md; merge baseline section only. */
  mergeClaudeMd?: boolean;
}

export interface ApplyBundleResult {
  written: string[];
  merged: string[];
  skipped: string[];
}

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

function mergeClaudeMdContent(existing: string, incoming: string): string {
  if (existing.includes(CLAUDE_CODE_BASELINE_HEADER)) {
    const start = existing.indexOf(CLAUDE_CODE_BASELINE_HEADER);
    const endMarker = "<!-- architectai:baseline:end -->";
    const end = existing.indexOf(endMarker, start);
    if (end >= 0) {
      const after = end + endMarker.length;
      return existing.slice(0, start) + incoming.slice(incoming.indexOf(CLAUDE_CODE_BASELINE_HEADER)) + existing.slice(after);
    }
    return `${existing.trim()}\n\n${incoming.trim()}\n`;
  }
  return `${existing.trim()}\n\n${incoming.trim()}\n`;
}

export async function applyClaudeCodeBundle(
  opts: ApplyBundleOptions,
): Promise<ApplyBundleResult> {
  const { repoRoot, files, mergeClaudeMd = true } = opts;
  const written: string[] = [];
  const merged: string[] = [];
  const skipped: string[] = [];

  for (const [relPath, content] of Object.entries(files)) {
    const dest = join(repoRoot, relPath);

    if (relPath === "CLAUDE.md" && mergeClaudeMd) {
      try {
        const existing = await readFile(dest, "utf8");
        const mergedContent = mergeClaudeMdContent(existing, content);
        await writeFile(dest, mergedContent, "utf8");
        merged.push(relPath);
        continue;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }

    if (relPath === ".architectai/credentials.example.json") {
      skipped.push(relPath);
      continue;
    }

    if (relPath === ".architectai/credentials.json") {
      await ensureDir(dest);
      await writeFile(dest, content, { mode: 0o600 });
      written.push(relPath);
      continue;
    }

    await ensureDir(dest);
    await writeFile(dest, content, "utf8");
    written.push(relPath);
  }

  return { written, merged, skipped };
}

export function parseBundleJson(raw: string): ClaudeCodeFileMap {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Bundle must be a JSON object of path → file content");
  }
  const out: ClaudeCodeFileMap = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== "string") {
      throw new Error(`Bundle entry "${k}" must be a string`);
    }
    out[k] = v;
  }
  if (!out["CLAUDE.md"] || !out[".architectai/manifest.json"]) {
    throw new Error("Bundle must include CLAUDE.md and .architectai/manifest.json");
  }
  return out;
}

export async function readBundleFromPath(bundlePath: string): Promise<ClaudeCodeFileMap> {
  const raw = await readFile(bundlePath, "utf8");
  return parseBundleJson(raw);
}
