# UX Spec Audit — `docs/05` thirteen rules

**Date:** 2026-05-29  
**Baseline:** UX Track gates `gate:ux-a` … `gate:ux-d`  
**Source:** `docs/05_ARCHITECTAI_FRONTEND_SPEC.md` non-negotiables

## Summary

| Result | Count |
|--------|------:|
| Pass (automated or implemented) | 10 |
| Deferred (manual / P2) | 3 |

Deferred items are within the UX-E limit (≤3).

## Checklist

| # | Rule | Status | Evidence |
|---|------|--------|----------|
| 1 | Dark-only theme | **Pass** | `globals.css` `color-scheme: dark`; `UXE-E2E-01` |
| 2 | `<kbd>` for shortcuts | **Pass** | `KbdHint` component; `UXE-E2E-02` |
| 3 | No right-panel tabs on workspace | **Pass** | `UXC-E2E-01` |
| 4 | 48px workspace header | **Pass** | `WorkspacePage` `h-12`; `UXE-E2E-03` |
| 5 | “Accept & Apply Fix” label (extension) | **Pass** | `panels.test.ts` P7-EC-09 / UXD-EXT-03 |
| 6 | Equal-weight Ignore / Exception / Fix | **Pass** | `driftPanelHtml` bordered actions; UXD-EXT-04 |
| 7 | Drift-score sub-text on cards | **Pass** | `ArchitectureCard` status subtext; `UXD-E2E-04` |
| 8 | Always-cancel generation | **Pass** | `UXA-E2E-03` |
| 9 | Two card types on dashboard | **Pass** | `MyProjectCard` + `TopArchCard`; `UXD-E2E-04` |
| 10 | Wrench icon size 16 | **Deferred** | Manual visual QA (`UXE-MAN-01`) |
| 11 | Accordion chevrons | **Deferred** | Layers panel not in UX gate scope (`UXE-MAN-02`) |
| 12 | 3s undo toast on answer edit | **Pass** | `EDIT_ANSWER_NOTICE_MS`; `UXE-UT-01` |
| 13 | Hover-edit interrogation answers | **Pass** | `UXB-E2E-03` |

## Clerk production path (UX-P0-12)

| Environment | Status | Notes |
|-------------|--------|-------|
| Local / CI default | **Pass** | Dev bearer via `architectai_dev_clerk_id`; all `gate:ux-*` except optional clerk |
| Staging with Clerk keys | **Pass** (when configured) | `pnpm gate:ux-clerk` with `CLERK_E2E=1` + `VITE_CLERK_PUBLISHABLE_KEY`; `UXE-E2E-04` |

## Sign-off

UX Track P0-13 satisfied: automated subset green under `gate:ux-e`; three deferrals documented above.
