import type { CursorConfig } from "@architectai/shared";

export interface WrittenFile {
  relativePath: string;
  content: string;
}

/** Writes `.architectai/*` from cursor-config export JSON (P7-E2E-01, P7-EC-01 fallback). */
export function filesFromCursorConfigExport(
  exportContent: string,
  config: CursorConfig,
): WrittenFile[] {
  let bundle: Record<string, unknown>;
  try {
    bundle = JSON.parse(exportContent) as Record<string, unknown>;
  } catch {
    bundle = buildMinimalBundle(config);
  }

  const files: WrittenFile[] = [];
  for (const [key, value] of Object.entries(bundle)) {
    const rel = key.startsWith(".architectai/")
      ? key
      : `.architectai/${key.replace(/^\//, "")}`;
    files.push({
      relativePath: rel,
      content: `${JSON.stringify(value, null, 2)}\n`,
    });
  }

  files.push({
    relativePath: ".architectai/architectai.config.json",
    content: `${JSON.stringify(config, null, 2)}\n`,
  });

  return dedupeByPath(files);
}

export function buildMinimalBundle(config: CursorConfig): Record<string, unknown> {
  return {
    ".architectai/manifest.json": {
      architectureId: config.architectureId,
      organizationId: config.organizationId,
      name: config.architectureName,
      schemaVersion: 1,
    },
    ".architectai/rules.json": { rules: config.governanceRules },
    ".architectai/boundaries.json": { layers: [], services: [] },
    ".architectai/forbidden-patterns.json": { patterns: [] },
    ".architectai/contracts.json": { connections: [] },
  };
}

function dedupeByPath(files: WrittenFile[]): WrittenFile[] {
  const map = new Map<string, WrittenFile>();
  for (const f of files) map.set(f.relativePath, f);
  return [...map.values()];
}
