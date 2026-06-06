/** Repo files produced by `claude-code-bundle` export (Claude Code growth pivot). */

export const CLAUDE_CODE_BASELINE_HEADER = "## ArchitectAI verified baseline";

export interface ClaudeCodeBundleInput {
  manifest: Record<string, unknown>;
  rules: Record<string, unknown>;
  boundaries: Record<string, unknown>;
  forbiddenPatterns: Record<string, unknown>;
  contracts: Record<string, unknown>;
}

export interface ClaudeCodeBundleOptions {
  apiBaseUrl?: string;
  workspaceTokenPlaceholder?: string;
  architectureId?: string;
}

export type ClaudeCodeFileMap = Record<string, string>;

function renderClaudeMdSection(input: ClaudeCodeBundleInput): string {
  const name = String(input.manifest.name ?? "Architecture");
  const version = String(input.manifest.version ?? 1);
  const trustGrade = input.manifest.trustGrade;
  const verificationRunId = input.manifest.verificationRunId;
  const services =
    (input.boundaries.services as { name: string; layer: string }[] | undefined) ?? [];

  const lines = [
    CLAUDE_CODE_BASELINE_HEADER,
    "",
    `**Architecture:** ${name} · **Locked version:** ${version}`,
    trustGrade != null ? `**Trust Grade:** ${trustGrade}` : null,
    verificationRunId
      ? `**Verification run:** \`${verificationRunId}\``
      : "**Verification:** Export after completing the Verification Pass in ArchitectAI.",
    "",
    "### Services (do not invent new ones without updating the baseline)",
    ...services.map((s) => `- \`${s.name}\` (${s.layer})`),
    "",
    "### Governance",
    "- Respect layer boundaries in `.architectai/boundaries.json`.",
    "- Honor rules in `.architectai/rules.json` and contracts in `.architectai/contracts.json`.",
    "- Before large refactors, call MCP tool `architectai_get_trust_grade` or read `.architectai/manifest.json`.",
    "- If a PostToolUse drift hook fails, fix the violation before continuing.",
    "",
    "<!-- architectai:baseline:end -->",
  ].filter((l): l is string => l != null);

  return lines.join("\n");
}

function mergeClaudeSettingsHook(
  existing: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const hooks = (existing?.hooks as Record<string, unknown> | undefined) ?? {};
  const post = (hooks.PostToolUse as unknown[] | undefined) ?? [];
  const driftHook = {
    matcher: "Write|Edit",
    hooks: [
      {
        type: "command",
        command: 'node scripts/architectai-drift.mjs --file "$CLAUDE_FILE_PATH"',
      },
    ],
  };
  const already = post.some(
    (h) =>
      typeof h === "object" &&
      h !== null &&
      String((h as { hooks?: unknown[] }).hooks?.[0] ?? "").includes("drift-hook"),
  );
  return {
    ...existing,
    hooks: {
      ...hooks,
      PostToolUse: already ? post : [...post, driftHook],
    },
  };
}

export function buildClaudeCodeFileMap(
  input: ClaudeCodeBundleInput,
  opts: ClaudeCodeBundleOptions = {},
): ClaudeCodeFileMap {
  const apiBase = opts.apiBaseUrl ?? "http://127.0.0.1:4000";
  const tokenPlaceholder = opts.workspaceTokenPlaceholder ?? "YOUR_WORKSPACE_TOKEN";

  const claudeSection = renderClaudeMdSection(input);
  const claudeMd = [
    "# Project context",
    "",
    "<!-- Merge this file with your existing CLAUDE.md; ArchitectAI only owns the section below. -->",
    "",
    claudeSection,
  ].join("\n");

  const mcpJson = {
    mcpServers: {
      architectai: {
        command: "npx",
        args: ["-y", "@architectai/mcp-server"],
        env: {
          ARCHITECTAI_API_URL: apiBase,
          ARCHITECTAI_WORKSPACE_TOKEN: tokenPlaceholder,
        },
      },
    },
  };

  const settings = mergeClaudeSettingsHook(undefined);

  const reviewCommand = [
    "# ArchitectAI review",
    "",
    "Review the current diff against the verified baseline in `.architectai/manifest.json`.",
    "Flag any new services, boundary violations, or missing contract updates.",
  ].join("\n");

  const skill = [
    "---",
    "name: architectai-governance",
    "description: When to use ArchitectAI MCP tools for verified architecture and drift",
    "---",
    "",
    "Use `architectai_get_trust_grade` before proposing new services.",
    "Use `architectai_check_file` after editing files that touch API or service boundaries.",
  ].join("\n");

  const credentialsExample = {
    apiBaseUrl: apiBase,
    workspaceToken: tokenPlaceholder,
    architectureId: opts.architectureId ?? String(input.manifest.architectureId ?? ""),
    note: "Copy to .architectai/credentials.json (gitignored) after export.",
  };

  const applyBundleScript = [
    "#!/usr/bin/env node",
    "import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';",
    "import { dirname, join } from 'node:path';",
    "const bundlePath = process.argv[2];",
    "if (!bundlePath) {",
    "  console.error('Usage: node scripts/apply-architectai-bundle.mjs <bundle.json> [repo-root]');",
    "  process.exit(1);",
    "}",
    "const root = process.argv[3] ?? '.';",
    "const files = JSON.parse(readFileSync(bundlePath, 'utf8'));",
    "for (const [rel, content] of Object.entries(files)) {",
    "  if (rel === 'scripts/apply-architectai-bundle.mjs') continue;",
    "  const dest = join(root, rel);",
    "  mkdirSync(dirname(dest), { recursive: true });",
    "  const opts = rel === '.architectai/credentials.json' ? { mode: 0o600 } : undefined;",
    "  writeFileSync(dest, content, opts);",
    "}",
    "console.log('[ArchitectAI] Applied', Object.keys(files).length, 'files to', root);",
    "console.log('[ArchitectAI] Run: cd', root, '&& claude');",
  ].join("\n");

  const driftScript = [
    "#!/usr/bin/env node",
    "import { readFileSync, existsSync } from 'node:fs';",
    "import { resolve, relative } from 'node:path';",
    "const fileIdx = process.argv.indexOf('--file');",
    "const file = fileIdx >= 0 ? process.argv[fileIdx + 1] : process.env.CLAUDE_FILE_PATH;",
    "if (!file) process.exit(0);",
    "const credPath = resolve('.architectai/credentials.json');",
    "if (!existsSync(credPath)) {",
    "  console.error('[ArchitectAI] drift: missing .architectai/credentials.json');",
    "  process.exit(0);",
    "}",
    "const creds = JSON.parse(readFileSync(credPath, 'utf8'));",
    "const abs = resolve(file);",
    "const rel = relative(process.cwd(), abs).replace(/\\\\/g, '/');",
    "const content = readFileSync(abs, 'utf8').slice(0, 500000);",
    "const res = await fetch(`${creds.apiBaseUrl}/api/drift/check`, {",
    "  method: 'POST',",
    "  headers: {",
    "    'Content-Type': 'application/json',",
    "    Authorization: `Bearer ${creds.workspaceToken}`,",
    "  },",
    "  body: JSON.stringify({",
    "    architectureId: creds.architectureId,",
    "    filePath: rel,",
    "    fileContent: content,",
    "  }),",
    "});",
    "const body = await res.json().catch(() => ({}));",
    "const data = body.data ?? body;",
    "if (data?.hasDrift) {",
    "  console.error('[ArchitectAI] Drift detected:', JSON.stringify(data.drifts ?? data));",
    "  process.exit(1);",
    "}",
    "process.exit(0);",
  ].join("\n");

  return {
    "CLAUDE.md": claudeMd,
    ".architectai/manifest.json": JSON.stringify(input.manifest, null, 2),
    ".architectai/rules.json": JSON.stringify(input.rules, null, 2),
    ".architectai/boundaries.json": JSON.stringify(input.boundaries, null, 2),
    ".architectai/forbidden-patterns.json": JSON.stringify(input.forbiddenPatterns, null, 2),
    ".architectai/contracts.json": JSON.stringify(input.contracts, null, 2),
    ".architectai/credentials.example.json": JSON.stringify(credentialsExample, null, 2),
    ".mcp.json": JSON.stringify(mcpJson, null, 2),
    ".claude/settings.json": JSON.stringify(settings, null, 2),
    ".claude/commands/architectai-review.md": reviewCommand,
    ".claude/skills/architectai-governance/SKILL.md": skill,
    "scripts/apply-architectai-bundle.mjs": applyBundleScript,
    "scripts/architectai-drift.mjs": driftScript,
    ".gitignore": [
      "# ArchitectAI — keep credentials out of git",
      ".architectai/credentials.json",
    ].join("\n"),
  };
}

/** Flat JSON export (same keys as cursor-config map + Claude Code paths). */
export function claudeCodeBundleToJson(
  input: ClaudeCodeBundleInput,
  opts?: ClaudeCodeBundleOptions,
): string {
  return JSON.stringify(buildClaudeCodeFileMap(input, opts), null, 2);
}
