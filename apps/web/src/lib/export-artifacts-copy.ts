export const EXPORT_ARTIFACTS = [
  {
    path: "CLAUDE.md",
    title: "Verified baseline (Claude Code)",
    description: "Merge-safe section with Trust Grade, services, and governance rules for every session.",
  },
  {
    path: ".architectai/manifest.json",
    title: "Governance manifest",
    description: "Locked baseline, verification run id, and Trust Grade stamped at export.",
  },
  {
    path: ".mcp.json",
    title: "MCP server config",
    description: "Connects Claude Code to ArchitectAI tools (`architectai_get_trust_grade`, drift checks).",
  },
  {
    path: ".claude/settings.json",
    title: "PostToolUse drift hook",
    description: "Runs drift checks after agent file writes (deterministic, not prompt-only).",
  },
  {
    path: ".architectai/contracts/*",
    title: "Service contracts",
    description: "API surfaces enforced against your codebase.",
  },
  {
    path: ".architectai/rules/*",
    title: "Governance rules",
    description: "Import boundaries, auth patterns, and data-handling policies.",
  },
  {
    path: "docs/adr-*.md",
    title: "Architecture decision records",
    description: "Human-readable decisions linked to Decision Lineage nodes.",
  },
] as const;

export const CLAUDE_CODE_SETUP_STEPS = [
  {
    id: "files",
    label: "Write repo files",
    detail: "Download the bundle, then run `npx architectai init --bundle <file>.json` (merges CLAUDE.md).",
  },
  {
    id: "mcp",
    label: "Connect MCP",
    detail: "Run `claude mcp add` using the generated `.mcp.json`, or copy credentials into `.architectai/credentials.json`.",
  },
  {
    id: "hooks",
    label: "Enable hooks",
    detail: "Commit `.claude/settings.json` so PostToolUse drift checks run after agent edits.",
  },
] as const;

export const DRIFT_LOOP_STEPS = [
  "Claude Code edits files against the locked, verified baseline in CLAUDE.md.",
  "PostToolUse hook runs drift checks (target P95 <200ms).",
  "Violations surface in the terminal; MCP tools expose Trust Grade and file context.",
  "Fix or override with reason; re-export from ArchitectAI when the architecture changes.",
  "Legacy: VS Code / Cursor extension still supports on-save drift if you use a GUI IDE.",
] as const;
