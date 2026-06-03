import { buildMinimalBundle, filesFromCursorConfigExport } from "./bundle-writer";
import type { CursorConfig } from "@architectai/shared";

/** Downloadable `.architectai/` fallback when deep-link is blocked (P7-EC-01). */
export function buildFallbackArchiveManifest(
  config: CursorConfig,
  exportContent?: string | null,
): { filename: string; files: { path: string; content: string }[] } {
  const content = exportContent ?? JSON.stringify(buildMinimalBundle(config), null, 2);
  const written = filesFromCursorConfigExport(content, config);
  return {
    filename: `${config.architectureName.replace(/\s+/g, "-").toLowerCase()}-architectai-bundle.json`,
    files: written.map((f) => ({ path: f.relativePath, content: f.content })),
  };
}
