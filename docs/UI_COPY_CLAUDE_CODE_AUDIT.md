# UI copy audit — Claude Code pivot

**Date:** 2026-06-03  
**Scope:** `apps/web` user-visible strings  
**Plan:** `CLAUDE_CODE_GROWTH_PIVOT.md`

## Positioning (target voice)

| Old mental model | New mental model |
|------------------|------------------|
| Export to IDE | **Install verified baseline in your repo** (Claude Code) |
| Deep link / extension / on save | **CLAUDE.md + MCP + PostToolUse hooks** |
| Primary runtime: VS Code / Cursor | **Primary: Claude Code**; legacy GUI IDEs secondary |
| "Governed architecture generator" | **Independent verification → stamp repo → agent implements** |

---

## Status by surface

| Surface | Status | Notes |
|---------|--------|-------|
| `ClaudeCodeSetupModal` | ✅ Aligned | Primary export UX |
| `export-artifacts-copy.ts` | ✅ Aligned | Artifacts + drift steps |
| `useJourneyProgress` | ✅ Aligned | Export to repo / Agent drift |
| `WorkspacePage` header CTA | ✅ Aligned | "Export to repo" |
| `ExportEducationModal` | ⚠️ Partial | Still says "legacy GUI IDEs" — OK; tighten headline |
| `IdePickerModal` | ✅ Legacy lane | Correctly labeled "Legacy IDE export" |
| `ExportLaunchOverlay` | ⚠️ Legacy only | VS Code/extension copy — correct *for legacy path* |
| `ExportWizardPage` | ⚠️ Mixed | Repo title OK; legacy quick path still "IDE" |
| `LandingHero` | ✅ Aligned | Uses `PRODUCT_TAGLINE` from `product-copy.ts` |
| `LandingProgressSheet` | ✅ Aligned | Verification + repo path hinted |
| `ArchitectureCard` (dashboard) | ✅ Aligned | Default `claude-code`, repo CTAs |
| `WorkspaceToolbar` | ✅ Aligned | Opens primary export via `onExportClick` |
| `export-handoff.ts` | ✅ Aligned | Generic "Export failed" |
| `HandoffFailureActions` | ✅ Legacy | Labeled legacy recovery |
| `lock-cta-label.ts` | ✅ Aligned | "for repo export" |
| `PreparingArchitectureBanner` | ✅ Aligned | Claude Code install mention |
| `GenerationExperience` | ✅ OK | Generation-focused, not export |
| `WorkspaceCoachMarks` | ✅ OK | Canvas verdicts, not IDE |

---

## Strings to replace (implementation list)

### P0 — User-facing primary path

1. **LandingHero** — Add Claude Code to subhead; clarify lock → repo install.
2. **ArchitectureCard** — Default `claude-code`; "Sync to repo" / "Open in Claude Code" when applicable; "Export to repo".
3. **WorkspaceToolbar** — Route export icon to Claude Code setup; title "Export to repo".
4. **export-handoff** — Generic error messages.
5. **ExportEducationModal** — Title/body: repo + Claude Code first.
6. **ExportWizardPage** — Target label, terminal copy, legacy path labels.
7. **Re-export toasts** (IdePickerModal / ClaudeCodeSetupModal messages).

### P1 — Legacy path (label clearly as legacy)

8. **ExportLaunchOverlay** — Prefix titles with "Legacy:" or keep but ensure only shown for vscode/cursor.
9. **HandoffFailureActions** — "If your IDE did not open" → "If the legacy IDE handoff did not open".

### P2 — Tests / E2E

10. Update E2E only if button labels change (`workspace-export-btn` behavior, not text).

---

## Wording dictionary (use consistently)

| Use | Avoid (primary path) |
|-----|------------------------|
| Claude Code | Cursor, IDE (unless legacy section) |
| Install in repo / Export to repo | Export to IDE |
| CLAUDE.md, MCP, hooks | Extension, deep link, on save |
| Verified baseline | Cursor config (use "Legacy IDE bundle" instead) |
| Agent drift / PostToolUse hook | Gutter, Drift Panel (legacy only) |
| Legacy IDE export | Recommended / Primary |
