# Claude Code setup (ArchitectAI)

## Prerequisites

1. Complete **Verification Pass** and **Lock** in the ArchitectAI workspace.
2. Run Postgres migration `0002_claude_code.sql` in production.

## 1. Export from the web app

**Workspace → Export to repo → Generate Claude Code bundle → Download bundle.**

The bundle includes:

- `CLAUDE.md` (verified baseline section)
- `.architectai/*` (manifest, rules, boundaries, contracts)
- `.architectai/credentials.json` (workspace token — **add to `.gitignore`**)
- `.mcp.json`, `.claude/settings.json` (MCP + PostToolUse drift hook)

## 2. Apply to your repository

```bash
npx architectai init --bundle ./architectai-*-claude-code.json
# or
cat bundle.json | npx architectai init
```

Merge `CLAUDE.md` if you already have project context.

## 3. Connect MCP

```bash
claude mcp add architectai
# or merge the generated .mcp.json into your project
```

Set `ARCHITECTAI_REPO_ROOT` to your repo root when running the MCP server from a subdirectory.

## 4. Drift hook (PostToolUse)

`.claude/settings.json` runs:

```bash
npx -y @architectai/drift-hook --file "$CLAUDE_FILE_PATH"
```

Requires `.architectai/credentials.json` or env vars:

- `ARCHITECTAI_API_URL`
- `ARCHITECTAI_WORKSPACE_TOKEN`
- `ARCHITECTAI_ARCHITECTURE_ID`

Use `--soft` on the hook command to log violations without failing the agent turn.

## 5. API aliases

Legacy `/api/cursor/*` routes are mirrored at `/api/agent/*` for Claude Code runtimes.

## Verify locally

```bash
pnpm gate:claude-runtime
pnpm gate:claude-code-full   # includes web E2E (API on :4001)
```
