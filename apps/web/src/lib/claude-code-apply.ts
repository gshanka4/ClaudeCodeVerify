/** Browser helpers for Claude Code bundle install (no npm publish required). */

export function buildApplyBundleScript(bundleFilename: string): string {
  return `#!/usr/bin/env node
/**
 * Apply ArchitectAI Claude Code bundle — run from your repo root:
 *   node scripts/apply-architectai-bundle.mjs ${bundleFilename}
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const bundlePath = process.argv[2] ?? "${bundleFilename}";
const root = process.argv[3] ?? ".";
const files = JSON.parse(readFileSync(bundlePath, "utf8"));

for (const [rel, content] of Object.entries(files)) {
  if (rel === "scripts/apply-architectai-bundle.mjs") continue;
  const dest = join(root, rel);
  mkdirSync(dirname(dest), { recursive: true });
  const mode = rel === ".architectai/credentials.json" ? 0o600 : undefined;
  writeFileSync(dest, content, mode !== undefined ? { mode } : undefined);
}

console.log("[ArchitectAI] Wrote", Object.keys(files).length, "files into", root);
console.log("[ArchitectAI] Next: cd", root, "&& claude");
`;
}

export function claudeCodeLaunchInstructions(repoPath = "your-repo"): string {
  return [
    `cd ${repoPath}`,
    "claude",
    "",
    'In Claude Code, ask: "Read CLAUDE.md and .architectai/manifest.json — follow the verified baseline."',
  ].join("\n");
}
