# UX Track — Implementation Plan & Test Specification

**Version:** 1.0  
**Date:** 2026-05-29  
**Status:** Ready to build  
**Requirements:** `UX_PRODUCTION_IMPROVEMENTS.md` (backlog UX-P0 … UX-P2)  
**Companion:** `TEST_PLAN.md` (UX Track gate checklist) · `docs/05_ARCHITECTAI_FRONTEND_SPEC.md` · `LLM_PRODUCTION_INTEGRATION.md` (deferred)  
**Baseline:** Phases 0–7 + Batch 1 (A–G) + Batch 2 (H–I) · gates `gate:phase-h`, `gate:phase-i` green

---

## Executive summary

The **UX Track** makes ArchitectAI feel production-grade **before** real LLM integration. Work is split into five gated phases (**UX-A → UX-E**), each with happy-path tests, 🔴 blocking edge cases, and a `pnpm gate:ux-*` script.

| Phase | Theme | Backlog IDs | Est. |
|-------|-------|-------------|------|
| **UX-A** | Generation overlay trust | P0-01–05, P1-01 | 1–2 weeks |
| **UX-B** | Interrogation & resume | P0-06–08, P1-07–08 | 1 week |
| **UX-C** | Workspace & lineage | P0-09, P1-02–04 | 1 week |
| **UX-D** | Export, IDE, dashboard | P0-10–11, P1-05–06, P1-09–11 | 1 week |
| **UX-E** | Spec audit + Clerk staging | P0-12–13 | 3–5 days |

**Combined gate:** `pnpm gate:ux` → runs `gate:ux-a` … `gate:ux-e` sequentially.

**Principle:** Mock backend stays default in CI. UX-A adds **simulated slow/error** paths on the API so Playwright can rehearse production pacing without Anthropic.

---

## Product decisions (UX Track)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Extend `GenerationProgressEvent` with `phase` enum | Drives P0-01 labels without new SSE event types |
| D2 | Slow gen via `GENERATION_SLOW_MS` env + `?slowGen=1` query (web passes to start API) | Rehearse 20–30s overlay in dev/CI |
| D3 | Cancel returns to **interrogation summary** (last question visible, overlay unmounted) | No orphan `/generate` route |
| D4 | `GET /api/generate/jobs/:architectureId/status` for refresh recovery | P0-05 without guessing arch state |
| D5 | Resume list: `GET /api/interrogate/sessions?status=active` | Server truth, not only `sessionStorage` |
| D6 | Category helper copy in `packages/config` until LLM | Static “why this question” per category |
| D7 | Trace panel default = **no tabs** on node select (spec delta) | UX-C moat visibility |
| D8 | Clerk E2E only in `gate:ux-e` when `CLERK_E2E=1` | CI default stays dev-auth |
| D9 | P2 items (live drift cards, sound, tour) **out of UX Track gate** | Documented deferrals |

---

## Shared contract changes

### `GenerationProgressEvent` (`packages/shared`)

```ts
export type GenerationPhase =
  | "requirements"
  | "services"
  | "contracts"
  | "governance"
  | "finalizing";

export interface GenerationProgressEvent {
  // existing fields…
  phase?: GenerationPhase;
  phaseLabel?: string;
}
```

### `GenerationJobStatus` (new, shared)

```ts
export interface GenerationJobStatus {
  architectureId: string;
  status: "running" | "complete" | "failed" | "cancelled";
  lastEventId: number;
  progress: GenerationProgressEvent | null;
  error: string | null;
}
```

### Interrogation session list (new DTO)

```ts
export interface InterrogationSessionSummary {
  sessionId: string;
  initialPrompt: string;
  answeredCount: number;
  maxQuestions: number;
  status: "active" | "complete";
  updatedAt: string;
}
```

---

# Phase UX-A — Generation overlay trust

**Goal:** Users trust a 30s wait—phased progress, slow-mode rehearsal, cancel, failure, reconnect, live node preview.

**Maps to:** UX-P0-01, P0-02, P0-03, P0-04, P0-05, P1-01 · closes gaps **H-EC-02, H-EC-03, H-EC-04** (TEST_PLAN).

---

## UX-A.1 — API & stream behavior

| File | Action |
|------|--------|
| `packages/shared/src/types.ts` | Add `GenerationPhase`, extend `GenerationProgressEvent`, add `GenerationJobStatus` |
| `apps/api/src/generation/mock-plan.ts` | Emit `phase` on each `progress` event; honor slow delay between events |
| `apps/api/src/generation/runner.ts` | Read `slowGeneration` from job opts; persist job status in hub/Redis |
| `apps/api/src/generation/stream-hub.ts` | Track `lastEventId`, job status snapshot |
| `apps/api/src/services/generation.service.ts` | `startGeneration` accepts `slowMode?: boolean`; expose `getJobStatus` |
| `apps/api/src/controllers/generation.controller.ts` | `GET /api/generate/jobs/:architectureId/status` |
| `apps/api/src/routes/generate.route.ts` | Register status route |
| `apps/api/test/api/ux-generation.test.ts` | **New** IT suite |
| `docs/04` OpenAPI | Document status route + `phase` on progress (if contract tests enforced) |

**Slow mode behavior:**

- Env `GENERATION_SLOW_MS=25000` (cap per-event delay).
- Body/query on `POST /api/generate/start`: `{ slowMode: true }` → stretches inter-event delays.
- E2E sets `VITE_GENERATION_SLOW=1` → web passes `slowMode` on auto-start.

**Failure simulation (dev/test only):**

- Header `X-Test-Generation-Error: 1` on stream or start → fails after 2 progress events (guarded by `NODE_ENV !== 'production'`).

---

## UX-A.2 — Web overlay

| File | Action |
|------|--------|
| `apps/web/src/components/generation/GenerationPhaseSteps.tsx` | **New** — 4-step checklist bound to `progress.phase` |
| `apps/web/src/components/generation/GenerationExperience.tsx` | Integrate phase steps; `data-testid` per phase |
| `apps/web/src/components/generation/GenerationOverlay.tsx` | Error panel; reconnect banner; retry/edit actions |
| `apps/web/src/components/generation/GenerationNodePreview.tsx` | **New** (P1-01) — scrollable node list from stream |
| `apps/web/src/hooks/useGenerationStream.ts` | Reconnect on mount if job `running`; `Last-Event-ID`; exponential backoff ×3 |
| `apps/web/src/hooks/useGenerationRecovery.ts` | **New** — poll `getJobStatus` when stream disconnected |
| `apps/web/src/lib/generation-phases.ts` | **New** UT — map phase → label |
| `apps/web/src/lib/api.ts` | `getGenerationJobStatus`, pass `slowMode` on start |
| `apps/web/src/pages/InterrogationPage.tsx` | Wire retry → restart gen; edit → dismiss overlay |
| `apps/web/e2e/helpers.ts` | `waitForGenerationPhase`, `enableSlowGeneration` |
| `apps/web/e2e/ux-generation.spec.ts` | **New** E2E suite |

---

## UX-A — Tests

### Happy path

| ID | Type | Test | Expected |
|----|------|------|----------|
| UXA-IT-01 | IT | `POST /generate/start` + SSE | Progress events include `phase` ∈ 4 values |
| UXA-IT-02 | IT | `GET /generate/jobs/:id/status` while running | `status: running`, `lastEventId` ≥ 0 |
| UXA-IT-03 | IT | Stream completes | `status: complete` |
| UXA-UT-01 | UT | `generation-phases.ts` labels | All phases have non-empty labels |
| UXA-UT-02 | UT | `useGenerationStream` reducer | `node` events append; `complete` sets connected false |
| UXA-E2E-01 | E2E | 7 answers → overlay → workspace | Phase steps visible ≥2; lands workspace |
| UXA-E2E-02 | E2E | Slow mode (`slowGen=1`) | Overlay visible ≥8s; phases advance |
| UXA-E2E-03 | E2E | Cancel → confirm | Returns interrogation; overlay gone; no `/generate` URL |
| UXA-E2E-04 | E2E | Node preview | ≥3 `generation-node-preview` rows before complete |

### Edge cases

| ID | Sev | Scenario | Expected |
|----|-----|----------|----------|
| UXA-EC-01 | 🔴 | `POST /generate/start` fails (500) | Error panel; “Retry”; no infinite spinner |
| UXA-EC-02 | 🔴 | SSE aborts mid-stream | “Reconnecting…” then resume OR failed + retry |
| UXA-EC-03 | 🔴 | Page **refresh** during slow gen | Reconnect via `Last-Event-ID` or status poll → complete |
| UXA-EC-04 | 🔴 | Cancel then **Retry** | New generation job; workspace not partial garbage |
| UXA-EC-05 | 🔴 | Double-click Cancel | Idempotent; single confirm dialog |
| UXA-EC-06 | 🔴 | `complete` never arrives (timeout 45s) | Timeout message + retry (slow test optional nightly) |
| UXA-EC-07 | 🟡 | Cancel during reconnect | Clean abort; no duplicate streams |
| UXA-EC-08 | 🟡 | Navigate back during overlay | Confirm leave OR auto-cancel policy documented |
| UXA-EC-09 | 🟡 | Zero nodes before error | Error panel still usable |
| UXA-EC-10 | 🟡 | `Last-Event-ID` stale server | Full resync from status endpoint |
| UXA-EC-11 | 🔴 | Test error header in CI | Fails at predictable point; “Edit answers” visible |
| UXA-EC-12 | 🟡 | Two tabs same session | Second tab shows recovery banner (best-effort) |

### Gate

```json
"gate:ux-a": "pnpm --filter @architectai/shared build && pnpm --filter @architectai/api exec vitest run test/api/ux-generation.test.ts --fileParallelism=false && pnpm --filter @architectai/web typecheck && pnpm --filter @architectai/web test && pnpm --filter @architectai/web exec playwright test e2e/ux-generation.spec.ts"
```

### UX-A Test Gate checklist

- [ ] UXA-IT-01–03 green
- [ ] UXA-EC-01–06, EC-11 green
- [ ] UXA-E2E-01–04 green
- [ ] `gate:phase-h` still green (regression)

---

# Phase UX-B — Interrogation & resume

**Goal:** Questions feel purposeful; users can resume, edit answers, and use imports/keyboard help.

**Maps to:** UX-P0-06, P0-07, P0-08, P1-07, P1-08.

---

## UX-B.1 — API

| File | Action |
|------|--------|
| `apps/api/src/services/interrogation.service.ts` | `listActiveSessions(ctx, limit)` |
| `apps/api/src/controllers/interrogation.controller.ts` | `GET /api/interrogate/sessions` |
| `apps/api/src/routes/interrogate.route.ts` | Register list route |
| `packages/config/src/index.ts` | `INTERROGATION_CATEGORY_COPY` — category → helper sentence |
| `apps/api/test/api/ux-interrogation.test.ts` | **New** |

---

## UX-B.2 — Web

| File | Action |
|------|--------|
| `apps/web/src/components/interrogation/QuestionContext.tsx` | **New** — chip + helper from config |
| `apps/web/src/components/interrogation/KeyboardLegend.tsx` | **New** — collapsible on Q1 |
| `apps/web/src/components/interrogation/ImportContextBadge.tsx` | **New** — shows when imports attached |
| `apps/web/src/components/dashboard/ResumeSessionCard.tsx` | **New** |
| `apps/web/src/pages/LandingPage.tsx` | Resume CTA when active sessions |
| `apps/web/src/pages/DashboardPage.tsx` | Resume list section |
| `apps/web/src/pages/InterrogationPage.tsx` | Mount QuestionContext; improve edit affordance (`data-testid="edit-answer-{id}"`) |
| `apps/web/src/hooks/useInterrogation.ts` | Toast on edit success |
| `apps/web/src/lib/import-context.ts` | **New** — parse mock JSON / OpenAPI snippet |
| `apps/web/e2e/ux-interrogation.spec.ts` | **New** |

---

## UX-B — Tests

### Happy path

| ID | Type | Test | Expected |
|----|------|------|----------|
| UXB-IT-01 | IT | `GET /interrogate/sessions?status=active` | Returns only caller's active sessions |
| UXB-IT-02 | IT | After 4 answers | `answeredCount: 4`, `maxQuestions: 7` |
| UXB-UT-01 | UT | Category copy | Every `CATEGORY_ORDER` category has helper text |
| UXB-UT-02 | UT | `import-context` parser | Valid OpenAPI snippet → badge data |
| UXB-E2E-01 | E2E | Q1 shows context chip + legend | `question-context`, `keyboard-legend` visible |
| UXB-E2E-02 | E2E | Answer 3 → leave → resume from dashboard | Returns to Q4; prior answers locked visible |
| UXB-E2E-03 | E2E | Edit Q2 after Q4 answered | Q3–Q4 preserved (P2-EC-02 regression) |
| UXB-E2E-04 | E2E | Paste import on landing | `import-context-badge` on interrogation |

### Edge cases

| ID | Sev | Scenario | Expected |
|----|-----|----------|----------|
| UXB-EC-01 | 🔴 | Resume wrong session id in URL | 404 or redirect to valid session |
| UXB-EC-02 | 🔴 | Two active sessions | Dashboard shows both; pick one |
| UXB-EC-03 | 🔴 | Resume completed session | CTA says “View architecture” not “Continue” |
| UXB-EC-04 | 🔴 | Edit first question clears nothing incorrectly | Downstream preserved |
| UXB-EC-05 | 🔴 | Empty import paste | No badge; no API error |
| UXB-EC-06 | 🟡 | Import > 1MB paste | Truncated with warning |
| UXB-EC-07 | 🟡 | RLS: other org session id | 404 |
| UXB-EC-08 | 🟡 | Freeform + edit hover | Edit still works on freeform row |
| UXB-EC-09 | 🟡 | Keyboard legend dismiss persists | localStorage `ux.legend.dismissed` |
| UXB-EC-10 | 🔴 | Resume after sign-out/sign-in same dev user | Session list restored |

### Gate

```json
"gate:ux-b": "pnpm --filter @architectai/api exec vitest run test/api/ux-interrogation.test.ts && pnpm --filter @architectai/web typecheck && pnpm --filter @architectai/web test && pnpm --filter @architectai/web exec playwright test e2e/ux-interrogation.spec.ts"
```

---

# Phase UX-C — Workspace & lineage feel

**Goal:** Decision Trace is the default moat surface; lock/export copy is clear; re-export feedback closes the loop.

**Maps to:** UX-P0-09, P1-02, P1-03, P1-04.

---

## UX-C.1 — Web (primary)

| File | Action |
|------|--------|
| `apps/web/src/pages/WorkspacePage.tsx` | Default right panel = trace on node select; no tab strip |
| `apps/web/src/components/workspace/DecisionTracePanel.tsx` | Primary layout; loading skeleton |
| `apps/web/src/components/workspace/LineageGraphDrawer.tsx` | **New** — slide-over from trace |
| `apps/web/src/components/workspace/LockArchitectureCta.tsx` | Copy: “Finalize v{N} for export” |
| `apps/web/src/components/workspace/ReExportToast.tsx` | **New** — after export handoff |
| `apps/web/e2e/ux-workspace.spec.ts` | **New** |

---

## UX-C — Tests

### Happy path

| ID | Type | Test | Expected |
|----|------|------|----------|
| UXC-E2E-01 | E2E | Click canvas node | `decision-trace-panel` visible without tab click |
| UXC-E2E-02 | E2E | Open lineage from trace | `lineage-graph-drawer` visible |
| UXC-E2E-03 | E2E | Lock CTA | `lock-architecture-cta` text contains version |
| UXC-E2E-04 | E2E | Export after lock | `re-export-toast` or handoff overlay step text |
| UXC-UT-01 | UT | Lock CTA label formatter | `v${version}` in string |

### Edge cases

| ID | Sev | Scenario | Expected |
|----|-----|----------|----------|
| UXC-EC-01 | 🔴 | Node without trace | Empty state “Trace not available” not blank |
| UXC-EC-02 | 🔴 | Rapid node switching | No stale trace content flash |
| UXC-EC-03 | 🔴 | Lock fails (409) | Inline error; canvas still usable |
| UXC-EC-04 | 🟡 | Lineage drawer ESC | Closes; trace still visible |
| UXC-EC-05 | 🟡 | Mobile/narrow viewport | Trace stacks below canvas |
| UXC-EC-06 | 🔴 | `generating` arch URL | Banner “Generation in progress” (if navigated incorrectly) |
| UXC-EC-07 | 🟡 | Re-export twice quickly | Single toast; no stack overflow |

### Gate

```json
"gate:ux-c": "pnpm --filter @architectai/web typecheck && pnpm --filter @architectai/web test && pnpm --filter @architectai/web exec playwright test e2e/ux-workspace.spec.ts"
```

---

# Phase UX-D — Export, IDE, dashboard

**Goal:** Handoff failure ladder complete; extension setup copy clear; dashboard tells project story; Cursor path shortened.

**Maps to:** UX-P0-10, P0-11, P1-05, P1-06, P1-09, P1-11.

---

## UX-D.1 — API (dashboard enrichment)

| File | Action |
|------|--------|
| `apps/api/src/services/architectures.service.ts` | Add `lastActivityAt`, `lastExportIde` to list DTO |
| `apps/api/test/api/ux-dashboard.test.ts` | **New** |

---

## UX-D.2 — Web

| File | Action |
|------|--------|
| `apps/web/src/components/export/ExportLaunchOverlay.tsx` | Failure ladder: install + copy link + download VSIX |
| `apps/web/src/components/export/HandoffFailureActions.tsx` | **New** |
| `apps/web/src/components/dashboard/ArchitectureCard.tsx` | Status icon + sub-text + timestamp |
| `apps/web/src/pages/DashboardPage.tsx` | Empty state CTA |
| `apps/web/src/pages/ExportWizardPage.tsx` | Cursor: 2-step or copy-link primary |
| `apps/web/e2e/ux-export-dashboard.spec.ts` | **New** |

---

## UX-D.3 — Extension

| File | Action |
|------|--------|
| `apps/cursor-extension/src/panels/html.ts` | Setup panel pending copy; normal panel dashboard link |
| `apps/cursor-extension/test/panels.test.ts` | Pending + dashboard link strings |

---

## UX-D — Tests

### Happy path

| ID | Type | Test | Expected |
|----|------|------|----------|
| UXD-IT-01 | IT | `GET /architectures` list | `lastActivityAt`, `lastExportIde` present |
| UXD-E2E-01 | E2E | VS export success | Launch overlay steps animate |
| UXD-E2E-02 | E2E | Mock handoff 409 | All three failure actions visible |
| UXD-E2E-03 | E2E | New user dashboard | `dashboard-empty-state` → landing CTA |
| UXD-E2E-04 | E2E | Card statuses | Ready arch shows ready icon/text |
| UXD-EXT-01 | UT | Setup HTML | Contains “Pick a folder” for pending |
| UXD-EXT-02 | UT | Normal panel HTML | Contains dashboard URL |

### Edge cases

| ID | Sev | Scenario | Expected |
|----|-----|----------|----------|
| UXD-EC-01 | 🔴 | Copy link clipboard denied | Fallback textarea visible |
| UXD-EC-02 | 🔴 | VSIX download 404 | Error message; other actions remain |
| UXD-EC-03 | 🔴 | Cursor picker → copy link only | No 4-step wizard required |
| UXD-EC-04 | 🟡 | Dashboard 50+ projects | Pagination or scroll perf OK |
| UXD-EC-05 | 🟡 | Card click while generating | Disabled or spinner |
| UXD-EC-06 | 🔴 | Extension setup pending path | No partial `.architectai/` (I-EC-03 regression) |
| UXD-EC-07 | 🟡 | Deep link malformed | Extension error message human-readable |

### Gate

```json
"gate:ux-d": "pnpm --filter @architectai/api exec vitest run test/api/ux-dashboard.test.ts && pnpm --filter architectai test && pnpm --filter @architectai/web typecheck && pnpm --filter @architectai/web test && pnpm --filter @architectai/web exec playwright test e2e/ux-export-dashboard.spec.ts"
```

---

# Phase UX-E — Spec audit & Clerk staging

**Goal:** Document `docs/05` compliance; prove Clerk path on staging.

**Maps to:** UX-P0-12, P0-13.

---

## UX-E.1 — Deliverables

| File | Action |
|------|--------|
| `docs/UX_SPEC_AUDIT.md` | **New** — 13 rules pass/fail/deferred |
| `apps/web/e2e/ux-spec-audit.spec.ts` | **New** — automatable subset |
| `apps/web/e2e/ux-clerk.staging.spec.ts` | **New** — `test.skip(!process.env.CLERK_E2E)` |

### `docs/05` thirteen rules (audit checklist)

| # | Rule | Automatable | Test ID |
|---|------|-------------|---------|
| 1 | Dark-only theme | Partial | UXE-E2E-01 |
| 2 | `<kbd>` for shortcuts | Yes | UXE-E2E-02 |
| 3 | No right-panel tabs on workspace | Yes | UXC-E2E-01 |
| 4 | 48px toolbar height | CSS measure | UXE-E2E-03 |
| 5 | “Accept & Apply Fix” label (extension) | UT | UXD-EXT-03 |
| 6 | Equal-weight Ignore / Exception / Fix | UT | UXD-EXT-04 |
| 7 | Drift-score sub-text | E2E extension mock | UXE-EC-01 |
| 8 | Always-cancel generation | Yes | UXA-E2E-03 |
| 9 | Two card types on dashboard | Yes | UXD-E2E-04 |
| 10 | Wrench icon size 16 | Manual | UXE-MAN-01 |
| 11 | Accordion chevrons | Manual | UXE-MAN-02 |
| 12 | 3s undo toast on fix apply | UT/timer | UXE-UT-01 |
| 13 | Hover-edit interrogation answers | Yes | UXB-E2E-03 |

---

## UX-E — Tests

| ID | Type | Test | Expected |
|----|------|------|----------|
| UXE-E2E-01 | E2E | Root `color-scheme` / bg token | Dark surfaces |
| UXE-E2E-02 | E2E | Landing + interrogation kbd | `<kbd>` elements exist |
| UXE-E2E-03 | E2E | Workspace toolbar box | height ≈ 48px ±2 |
| UXE-E2E-04 | E2E | Clerk staging sign-up flow | Workspace reachable (CLERK_E2E=1) |
| UXE-UT-01 | UT | Undo toast duration constant | 3000ms |
| UXE-EC-01 | 🟡 | Clerk session expired mid-flow | Redirect sign-in; no data leak |
| UXE-EC-02 | 🔴 | Audit documents ≤3 deferred | `UX_SPEC_AUDIT.md` signed off |

### Gate

```json
"gate:ux-e": "pnpm --filter @architectai/web exec playwright test e2e/ux-spec-audit.spec.ts && test -f docs/UX_SPEC_AUDIT.md",
"gate:ux-clerk": "CLERK_E2E=1 pnpm --filter @architectai/web exec playwright test e2e/ux-clerk.staging.spec.ts"
```

```json
"gate:ux": "pnpm gate:ux-a && pnpm gate:ux-b && pnpm gate:ux-c && pnpm gate:ux-d && pnpm gate:ux-e"
```

---

# P2 backlog (not in UX gate)

Tracked in `UX_PRODUCTION_IMPROVEMENTS.md`; implement after `gate:ux` or parallel if staffed.

| ID | Tests when implemented |
|----|------------------------|
| UX-P2-01 Live drift on cards | UX2-IT-01 WS aggregation |
| UX-P2-04 Analytics | Event schema + debugger UT |
| UX-P2-05 a11y | axe-playwright on modals |
| UX-P2-06 Skeletons | Visual snapshots |

---

# Cross-cutting regression (every UX phase)

After each `gate:ux-*`, run:

```bash
pnpm gate:phase-h && pnpm gate:phase-i && pnpm gate:phase-g
```

| Suite | Command |
|-------|---------|
| Phase H seamless flow | `gate:phase-h` |
| Phase I VS export | `gate:phase-i` |
| Phase G IDE handoff API | included in phase-i gate |
| Pre-ship smoke (optional) | `pnpm gate:pre-ship` |

---

# Systems affected (summary)

| App | New/updated tests | New E2E specs |
|-----|-------------------|---------------|
| `apps/api` | `ux-generation.test.ts`, `ux-interrogation.test.ts`, `ux-dashboard.test.ts` | — |
| `apps/web` | `generation-phases.test.ts`, import-context UT | `ux-generation`, `ux-interrogation`, `ux-workspace`, `ux-export-dashboard`, `ux-spec-audit`, `ux-clerk.staging` |
| `apps/cursor-extension` | `panels.test.ts` extensions | — |
| `packages/shared` | type extensions | — |
| `packages/config` | category copy | — |
| `docs` | `UX_SPEC_AUDIT.md` | — |

---

# Definition of done (UX Track)

1. `pnpm gate:ux` green on main.
2. All 🔴 edge cases in this document pass or are documented with owner + expiry.
3. `TEST_PLAN.md` UX Track section checklist fully checked.
4. `UX_PRODUCTION_IMPROVEMENTS.md` P0 items marked complete.
5. `gate:phase-h` / `gate:phase-i` regression green.
6. Team walkthrough: new engineer completes loop in &lt;5 min using `docs/UX_SPEC_AUDIT.md` + README.

**Then:** start `LLM_PRODUCTION_INTEGRATION.md` Phase LLM-A.

---

# Implementation order (suggested sprints)

| Sprint | Deliver | Gate |
|--------|---------|------|
| S1 | UX-A API (phase SSE + status + slow) | UXA-IT-* |
| S2 | UX-A web + E2E | `gate:ux-a` |
| S3 | UX-B | `gate:ux-b` |
| S4 | UX-C | `gate:ux-c` |
| S5 | UX-D | `gate:ux-d` |
| S6 | UX-E + `gate:ux` | ship UX Track |

---

## Traceability

| Backlog (`UX_PRODUCTION_IMPROVEMENTS.md`) | Phase | Primary tests |
|------------------------------------------|-------|---------------|
| UX-P0-01 … P0-05 | UX-A | UXA-* |
| UX-P1-01 | UX-A | UXA-E2E-04 |
| UX-P0-06 … P0-08 | UX-B | UXB-* |
| UX-P1-07, P1-08 | UX-B | UXB-E2E-04, legend |
| UX-P0-09, P1-02–04 | UX-C | UXC-* |
| UX-P0-10–11, P1-05–06, P1-09–11 | UX-D | UXD-* |
| UX-P0-12–13 | UX-E | UXE-* |
| H-EC-02–04 | UX-A | UXA-EC-01–06, 11 |
| MVP-EC-01 install prompt | UX-D | UXD-E2E-02 |
