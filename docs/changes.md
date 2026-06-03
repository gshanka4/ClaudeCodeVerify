# ArchitectAI — Product Changes & Implementation Plan

**Version:** 1.0  
**Date:** 2026-05-30  
**Status:** Implemented (run `pnpm gate:chg` after `pnpm exec playwright install`)  
**Companion:** `UX_PRODUCTION_IMPROVEMENTS.md` · `ux_implementation_plan.md` · `TEST_PLAN.md` · `docs/05_ARCHITECTAI_FRONTEND_SPEC.md`

---

## Executive summary

This document captures three workstreams:

| ID | Theme | Priority |
|----|--------|----------|
| **CHG-1** | Provenance graph in **center canvas** (not right drawer) | P0 |
| **CHG-2** | **First-time IDE extension install** → workspace picker flow | P0 |
| **CHG-3** | Cross-app improvements from product review (backlog + gates) | P1–P2 |

Each stream includes deliverables, test IDs, and blocking edge cases.

---

## CHG-1 — Center provenance graph (replace architecture canvas)

### Problem (today)

- From **Decision trace** (`DecisionTracePanel`), **View provenance graph** opens `LineageGraphDrawer` — a **fixed right overlay** (`LineageGraphDrawer.tsx`, `data-testid="lineage-graph-drawer"`).
- The **architecture canvas** stays visible underneath; the graph competes with the right panel for attention.
- Product intent: provenance is the moat — when exploring causality, the graph should be **primary**, not a side drawer.

### Target behavior

```text
┌──────────┬────────────────────────────────────┬─────────────────┐
│ Toolbar  │  MAIN (center)                     │ Right panel     │
│          │  • Default: ArchitectureCanvas     │ Decision trace  │
│          │  • Graph open: LineageGraphView    │ (unchanged)     │
│          │    (full main area)                │                 │
└──────────┴────────────────────────────────────┴─────────────────┘
```

1. User selects a canvas node → right panel shows **decision trace** (current, correct).
2. User clicks **View provenance graph** → **main** swaps from `ArchitectureCanvas` to `LineageGraphView`; right panel **stays** on decision trace (scroll position preserved if possible).
3. User clicks **Close** (or `Esc`) on the graph → main returns to **architecture canvas**; right panel still shows the same trace.
4. Toolbar **lineage toggle** follows the same center-swap semantics (not a right drawer).
5. Optional: subtle “Back to architecture” breadcrumb in graph header (desktop + mobile).

### Non-goals

- Do not move decision trace into the center.
- Do not use right-panel tabs (spec non-negotiable #3).

### Implementation plan

| Step | Area | Action |
|------|------|--------|
| 1 | State | Extend `useWorkspaceStore`: `lineageGraphOpen` → drives **main stage** (`"canvas" \| "lineage"`). Remove drawer-only semantics. |
| 2 | Layout | `WorkspacePage.tsx`: render `LineageGraphView` inside `<main>` when `lineageGraphOpen`; hide `ArchitectureCanvas` (keep mounted or unmount — prefer unmount + remount canvas on close for perf). |
| 3 | Component | Deprecate or repurpose `LineageGraphDrawer.tsx` → `LineageGraphStage.tsx` (no `fixed right-0`; fills `main`). |
| 4 | Trace panel | `DecisionTracePanel` / `DecisionLineageLayer`: `onOpenLineageGraph` only sets store flag; no drawer. |
| 5 | Graph chrome | `LineageGraphView`: primary close control + `Esc`; caption “Showing provenance for [service]”. |
| 6 | Focus | On open: `aria-hidden` on canvas region; focus close button. On close: restore focus to “View provenance graph” trigger. |
| 7 | Mobile | Graph uses full main height; right panel stacks below per existing `lg:` breakpoints — trace remains reachable via scroll. |

### Files (expected touch)

| File | Change |
|------|--------|
| `apps/web/src/pages/WorkspacePage.tsx` | Conditional main content |
| `apps/web/src/components/workspace/LineageGraphDrawer.tsx` | Replace with stage layout |
| `apps/web/src/components/workspace/LineageGraphView.tsx` | Header/close UX |
| `apps/web/src/stores/useWorkspaceStore.ts` | Stage enum / helpers |
| `apps/web/e2e/ux-workspace.spec.ts` | Update selectors (no drawer) |

### Test plan

| ID | Type | Scenario | Expected |
|----|------|----------|----------|
| CHG1-E2E-01 | E2E | Select node → open graph from trace | `lineage-graph-view` in **main**; `workspace-right-panel` still visible with `decision-trace-panel` |
| CHG1-E2E-02 | E2E | Close graph | `ArchitectureCanvas` / `workspace-node-*` visible; trace panel still visible |
| CHG1-E2E-03 | E2E | `Esc` closes graph | Same as CHG1-E2E-02 |
| CHG1-E2E-04 | E2E | Toolbar lineage toggle | Swaps main only; trace unchanged |
| CHG1-EC-01 | 🔴 EC | Open graph with no node selected | Full-architecture lineage caption; no crash |
| CHG1-EC-02 | 🔴 EC | Rapid open/close graph | No duplicate listeners; canvas reload stable |
| CHG1-EC-03 | 🟡 EC | Open graph during `generating` banner | Graph allowed or disabled with clear hint (product choice: **allow** with “snapshot may change” banner) |
| CHG1-A11Y-01 | Manual | Screen reader | Close button labeled; main region announces “Provenance graph” |

**Gate:** `pnpm --filter @architectai/web exec playwright test e2e/ux-workspace.spec.ts` (extend spec) + typecheck.

---

## CHG-2 — First-time ArchitectAI extension install → workspace picker

### Problem (today)

- Web **Export to IDE** flow (`IdePickerModal` → `runIdeExportHandoff` → `ExportLaunchOverlay`) is strong for **happy path**: lock → export → deep link → overlay steps.
- **Failure ladder** (`HandoffFailureActions`) appears on error: install link, copy link, VSIX download.
- Gaps for **first-time** users:
  - Browser cannot know if the VS Code extension is installed; overlay jumps to “Opening IDE” without a dedicated **Install extension** step.
  - Extension (`extension.ts`) prompts install only when deep link fires **without** active extension (`promptInstallExtension`).
  - After install, user must **manually** retry export; no guided “Step 2 of 4: Install → Open IDE → Pick folder”.
  - Returning users with extension installed should land on **workspace folder picker** in IDE (`pickWorkspaceFolder` / `setupPanelHtml` pending state) — partially implemented, not wired to web progress UI.

### Target user journeys

#### Journey A — Extension not installed (VS Code / Cursor)

```text
Web: Export → VS Code
  1. Prepare export (existing overlay steps)
  2. NEW: "Install ArchitectAI extension" (marketplace / VSIX)
  3. "Open Visual Studio" (deep link)
  4. "Choose workspace folder in IDE" (instructional; poll or user confirm)
  5. Done — drift panel active
```

#### Journey B — Extension already installed

```text
Web: Export → VS Code
  1. Prepare export
  2. Open IDE (deep link) — skip install step
  3. IDE: workspace folder dialog OR pending setup panel
  4. Done
```

### Implementation plan

#### Web (`apps/web`)

| Step | Action |
|------|--------|
| 1 | Add `ExportLaunchStep`: `"install-check" \| "install" \| "await-ide" \| "workspace-setup" \| …` in `export-handoff.ts`. |
| 2 | **Install detection (best-effort):** `localStorage` key `architectai_extension_ack_v1` set when user clicks “I installed” or on successful `postMessage` handshake (see step 4). Do not claim 100% detection in UI copy. |
| 3 | `ExportLaunchOverlay`: numbered checklist UI for first-time path; link `VSCODE_EXTENSION_INSTALL_URI`, **Download .vsix**, **Copy connect link**. |
| 4 | Optional **handshake page**: `/export/callback?architectureId=` — extension posts `architectai:connected` via `window` event or custom protocol callback; web marks install complete and advances step. |
| 5 | `IdePickerModal`: VS Code path uses enhanced flow; Cursor keeps copy-link + “Install Cursor extension” parity. |
| 6 | Dashboard card export (`ArchitectureCard`) reuses same `runIdeExportHandoff` pipeline. |

#### Extension (`apps/cursor-extension`)

| Step | Action |
|------|--------|
| 1 | On `handleDeepLink`: if extension active → pull bundle → `postConnectPanelMode` → **setup** vs **normal** (existing). |
| 2 | `setupPanelHtml` / `normalPanelHtml`: explicit copy for first connect vs return visit. |
| 3 | After folder pick: post message or update API workspace status (if endpoint added) so web can close overlay. |
| 4 | Command `architectai.reportReady` (optional): web polling `GET /api/export/handoff-status/:id` — thin mock OK for UX track. |
| 5 | Marketplace install: keep `promptInstallExtension`; add “Continue” after install to re-trigger deep link parse. |

#### API (`apps/api`) — optional thin contract

| Endpoint | Purpose |
|----------|---------|
| `POST /api/architectures/:id/export/handoff-session` | Returns `handoffSessionId` + deep link |
| `GET /api/architectures/:id/export/handoff-session/:sid` | `{ phase: "pending" \| "ide_opened" \| "workspace_linked" \| "failed" }` for web polling (mock transitions in dev) |

### Test plan

| ID | Type | Scenario | Expected |
|----|------|----------|----------|
| CHG2-E2E-01 | E2E | First-time export (cleared `localStorage`) | Overlay shows **Install** step before “Opening IDE” |
| CHG2-E2E-02 | E2E | Acknowledged install (`localStorage` set) | Install step skipped; deep link step shown |
| CHG2-E2E-03 | E2E | Handoff 409 | Failure ladder + install CTA (existing UXD-E2E-02 extended) |
| CHG2-E2E-04 | E2E | VSIX download button | `architectai.vsix` fetch or graceful error |
| CHG2-EXT-01 | UT | `postConnectPanelMode` | No folder → `setup`; bundle + folder → `normal` |
| CHG2-EXT-02 | UT | `promptInstallExtension` | Marketplace URI matches `VSCODE_EXTENSION_INSTALL_URI` |
| CHG2-EC-01 | 🔴 EC | User dismisses folder picker (I-EC-03) | Web shows “Pick a folder in IDE”; overlay not stuck on “Done” |
| CHG2-EC-02 | 🔴 EC | Deep link opened but extension inactive | Install prompt in IDE; web copy link fallback |
| CHG2-EC-03 | 🔴 EC | Clipboard denied | Fallback textarea (existing `handoff-copy-fallback`) |
| CHG2-EC-04 | 🟡 EC | Cursor export (copy-only) | Install instructions for Cursor marketplace / manual VSIX |
| CHG2-EC-05 | 🟡 EC | User closes overlay mid-flow | Re-export resumes at prepare step, not corrupt state |

**Gate:** new `e2e/ux-export-install.spec.ts` + extension UT + `gate:ux-d` extension.

---

## CHG-3 — Application review: recommended improvements

Findings from a full pass of the current app (landing → interrogation → generation → workspace → export → dashboard → extension), against `new_PRD.md` and `UX_PRODUCTION_IMPROVEMENTS.md`.

### P0 — Ship-quality (mock-backed)

| ID | Area | Improvement | Why it matters |
|----|------|-------------|----------------|
| IMP-P0-01 | Workspace | **CHG-1** center provenance graph | Aligns UI with “lineage is the moat” |
| IMP-P0-02 | Export | **CHG-2** extension install funnel | Closes the loop for first external testers |
| IMP-P0-03 | Generation | **Stale job recovery** on workspace refresh | User refreshes during gen — banner + poll `GET /api/generate/jobs/:id/status` (UX-A partial) |
| IMP-P0-04 | Interrogation | **Session expiry messaging** | 401 mid-session → landing with “Session expired” not silent failure |
| IMP-P0-05 | Workspace | **Lock vs ready** single explainer | Tooltip on disabled Export: “Finalize architecture to export” |
| IMP-P0-06 | Dashboard | **Empty vs loading** states | Skeleton on first load; avoid flash of empty CTA |

### P1 — Trust & continuity

| ID | Area | Improvement | Acceptance hint |
|----|------|-------------|-----------------|
| IMP-P1-01 | Landing | **Resume card** from `GET /api/interrogate/sessions` | “Continue 4/7” above hero (UX-B delivered — verify prominence) |
| IMP-P1-02 | Landing | **Import chips functional** | Jira/PRD/Swagger set `importType` + badge (not decorative) |
| IMP-P1-03 | Dashboard | **Live drift subtext** on cards | WebSocket or poll `openDriftCount` (PRD fast-follow) |
| IMP-P1-04 | Dashboard | **`lastActivityAt` relative time** | “Exported 2h ago” vs static status |
| IMP-P1-05 | Workspace | **Re-export toast action** | “Open in IDE again” button on `re-export-toast` |
| IMP-P1-06 | Extension | **Dashboard deep link** in normal panel | Already in HTML — verify URL uses `WEB_BASE_URL` in dev |
| IMP-P1-07 | Export | **Return path** | Overlay “Back to workspace” after success |
| IMP-P1-08 | Auth | **Clerk staging** smoke | `gate:ux-clerk` in release checklist |

### P2 — Polish & scale

| ID | Area | Improvement |
|----|------|-------------|
| IMP-P2-01 | Global | `axe-playwright` on modals (export, ide picker, gen overlay) |
| IMP-P2-02 | Workspace | Focus mode persists per architecture in `sessionStorage` |
| IMP-P2-03 | Canvas | Minimap / fit-view controls wired (toolbar placeholders today) |
| IMP-P2-04 | Lineage | Edge legend filter toggles (hide `validates` edges) |
| IMP-P2-05 | Generation | Optional sound / haptic on complete (off by default) |
| IMP-P2-06 | Analytics | Event schema: `export_started`, `graph_opened`, `install_clicked` |
| IMP-P2-07 | Mobile | Bottom sheet for right panel on small screens |
| IMP-P2-08 | LLM prep | Feature flag `VITE_MOCK_LLM=0` switches copy from static → API-driven labels |

### Suggested phased delivery

| Phase | Scope | Est. | Gate |
|-------|--------|------|------|
| **Phase CHG-A** | CHG-1 provenance center | 3–5 days | `ux-workspace` E2E + CHG1-* |
| **Phase CHG-B** | CHG-2 install funnel (web + extension) | 5–8 days | `ux-export-install` E2E + CHG2-* |
| **Phase CHG-C** | IMP-P0-03…P0-06 | 3–5 days | `gate:ux-a` + `gate:ux-d` regression |
| **Phase CHG-D** | IMP-P1 backlog | 1–2 weeks | Per-item E2E in `TEST_PLAN.md` |
| **Phase CHG-E** | IMP-P2 + LLM track handoff | Parallel | `gate:ux` + `LLM_PRODUCTION_INTEGRATION.md` |

### Cross-cutting regression (after each phase)

```bash
pnpm gate:ux
pnpm gate:phase-h && pnpm gate:phase-i
```

### Edge-case catalog (global)

| ID | Scenario | Expected system behavior |
|----|----------|---------------------------|
| G-EC-01 | Double-click Export | Debounce; single handoff session |
| G-EC-02 | Network offline mid-export | Overlay error + retry; no orphan lock |
| G-EC-03 | Architecture `generating` | Export disabled; banner visible |
| G-EC-04 | Architecture archived | 404 workspace; dashboard hides card |
| G-EC-05 | Multi-tab same user | Last write wins on session answers; export idempotent |
| G-EC-06 | Invalid deep link token | Extension error; web offers re-export |
| G-EC-07 | RLS / wrong org | 403 with safe message; no data leak |

---

## Open product decisions

| # | Question | Recommendation |
|---|----------|----------------|
| D1 | Keep lineage graph in toolbar toggle? | Yes — same center stage as trace button |
| D2 | Browser extension detection | Honest “Confirm installed” + optional handshake; no false certainty |
| D3 | Handoff status polling vs user-driven | **v1:** user clicks “I’ve picked a folder”; **v2:** API poll from extension heartbeat |
| D4 | Cursor first-time flow | Mirror VS Code steps but copy-link primary (no protocol install check) |

---

## Document map

| Doc | Role |
|-----|------|
| `changes.md` (this file) | New change requests + review backlog |
| `ux_implementation_plan.md` | Completed UX Track (A–E) |
| `TEST_PLAN.md` | Master test IDs — append CHG1/CHG2 columns when implementing |
| `LLM_PRODUCTION_INTEGRATION.md` | Model integration after UX/CHG gates green |

---

## Sign-off checklist (for implementer)

- [ ] CHG-1: Provenance graph renders in **center main**, trace stays in right panel
- [ ] CHG-2: First-time export shows **install → open IDE → workspace picker** journey
- [ ] CHG-2: Returning users skip install; IDE folder picker is next step
- [ ] CHG-3: P0 improvements scheduled in Phase CHG-C
- [ ] `TEST_PLAN.md` updated with CHG1-* and CHG2-* IDs
- [ ] E2E green before merge
