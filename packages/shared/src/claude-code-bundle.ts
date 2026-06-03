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

function mergeClaudeSettingsHook(existing: Record<string, unknown> | undefined): Record<string, unknown> {
  const hooks = (existing?.hooks as Record<string, unknown> | undefined) ?? {};
  const post = (hooks.PostToolUse as unknown[] | undefined) ?? [];
  const driftHook = {
    matcher: "Write|Edit",
    hooks: [
      {
        type: "command",
        command: "npx -y @architectai/drift-hook --file \"$CLAUDE_FILE_PATH\"",
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

  const initScript = [
    "#!/usr/bin/env sh",
    "set -e",
    'ROOT="${1:-.}"',
    'mkdir -p "$ROOT/.architectai" "$ROOT/.claude/commands" "$ROOT/.claude/skills/architectai-governance"',
    'echo "Pipe bundle JSON: cat bundle.json | npx architectai init"',
    'echo "Or: npx architectai init --bundle ./architectai-claude-code.json"',
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
    "scripts/architectai-init.sh": initScript,
  };
}

/** Flat JSON export (same keys as cursor-config map + Claude Code paths). */
export function claudeCodeBundleToJson(
  input: ClaudeCodeBundleInput,
  opts?: ClaudeCodeBundleOptions,
): string {
  return JSON.stringify(buildClaudeCodeFileMap(input, opts), null, 2);
}
