# ArchitectAI — UX & Interaction Improvements (Production Feel)

**Version:** 1.0  
**Date:** 2026-05-29  
**Status:** Planned — implement **before** real LLM integration  
**Companion:** `ux_implementation_plan.md` (file-level plan + test IDs) · `LLM_PRODUCTION_INTEGRATION.md` · `new_PRD.md` · `docs/05_ARCHITECTAI_FRONTEND_SPEC.md` · `TEST_PLAN.md`  
**Baseline:** Phases 0–7 + Batch 1 (A–G) + Batch 2 (H–I) complete

---

## Why this document exists

The core loop is **functionally wired** (interrogate → generate → workspace → export → IDE → drift), but much of the “AI” is still deterministic mock data. That is the right engineering choice for CI—but it means **interaction quality, trust, and failure UX have not been exercised** at real-world latency or error rates.

This plan polishes the product **as users will perceive it in production**, using the existing mock backend. The goal is a **production-grade feel** (clarity, recovery, pacing, accessibility, spec compliance) before swapping in real models.

> **Principle:** UX work should not wait for Anthropic. Simulate slow streams, failures, and empty states in the UI and extension **now**, so when LLM lands, only data quality changes—not the shell around it.

---

## Recommended sequencing (UX first, then LLM)

See **§8 Execution strategy** at the end. Summary:

| Track | When | Outcome |
|-------|------|---------|
| **UX Track (this doc)** | First (4–6 weeks of focused slices) | Loop feels complete, recoverable, and trustworthy on mock data |
| **LLM Track** (`LLM_PRODUCTION_INTEGRATION.md`) | Second | Same screens; real questions, architectures, latency, cost |
| **Ship gate** (`TEST_PLAN.md` Phase 7.x) | After both tracks | External users on lean hosting |

**Do not** treat “UX first” as “frontend only.” Several items need **small, stable API contracts** (e.g. session resume list, generation job status). Keep those APIs thin and mock-backed until LLM Track.

---

## Product north star (UX)

From `new_PRD.md` and `docs/05`:

1. **One continuous session** — interrogation → generation → workspace without “another app screen.”
2. **Decision Lineage is the moat** — trace/provenance is primary when a component is selected; never feel like an afterthought.
3. **Governance loop closes** — user always knows: *what to do next* (lock, export, open IDE, fix drift, return to dashboard).
4. **Failures are actionable** — no stack traces; always a retry, edit, or fallback path.
5. **Spec non-negotiables** — dark-only, `<kbd>` shortcuts, 48px toolbar, drift-score sub-text, etc. (`TEST_PLAN.md` cross-cutting UX suite).

---

## Current state vs gaps (by screen)

| Screen / flow | What works today | Gap vs production feel |
|---------------|------------------|------------------------|
| **Landing** | Hero, dev/Clerk sign-in, prompt validation | Weak “resume project”; import chips feel decorative; no cold-start / warming message |
| **Interrogation** | 7 questions, option auto-advance, freeform submit, overlay gen (H) | Questions feel canned; little “why this question”; edit/revise flow easy to miss; no explicit save-and-resume |
| **Generation overlay** | SSE stream, auto-nav to workspace (H) | Completes in seconds (mock); no phase labels for 30s wait; reconnect/cancel/failure UX incomplete |
| **Workspace** | Canvas, lineage panels, lock/export | Lock vs `ready` confusing; trace panel prominence vs spec; re-export → IDE feedback weak on web |
| **Export / handoff** | VS one-click (I), wizard for Cursor | Install/copy/vsix fallback could be clearer; Cursor path still heavy |
| **IDE extension** | Connect, bundle pull, picker, drift panel | Setup vs normal mode messaging; pending folder state; no in-IDE “loop back to dashboard” hint |
| **Dashboard** | Project cards | Drift on cards not live (PRD fast-follow); stale status after IDE activity |

---

## Improvement backlog (prioritized)

### P0 — Must fix before external testers (mock-backed)

These define whether the product **feels shippable**, independent of model quality.

| ID | Area | Improvement | Acceptance criteria |
|----|------|-------------|---------------------|
| UX-P0-01 | Generation overlay | **Phased progress copy** (Requirements → Services → Contracts → Governance) driven by SSE `progress` events | User sees ≥4 labeled phases; progress never looks “stuck” for 10s+ |
| UX-P0-02 | Generation overlay | **Simulated slow mode** in dev (`?slowGen=1` or env) — stretch mock stream to 20–30s | Designers/devs can rehearse real pacing without LLM |
| UX-P0-03 | Generation overlay | **Cancel with confirm** — always visible; matches spec “always-cancel gen” | Cancel → confirm → returns to last question or session summary; no orphan overlay |
| UX-P0-04 | Generation overlay | **Failure state** — API 5xx / stream error / timeout | Error panel + “Retry generation” + “Edit answers”; no blank overlay |
| UX-P0-05 | Generation overlay | **SSE reconnect** — use `Last-Event-ID`; show “Reconnecting…” | Refresh mid-gen resumes stream or shows recovery (align `H-EC-03`) |
| UX-P0-06 | Interrogation | **Question context line** — category + 1 sentence why it matters | Every card shows category chip + helper text (can be static per category until LLM) |
| UX-P0-07 | Interrogation | **Resume incomplete session** — dashboard + landing | Returning user sees “Continue interrogation” with progress (e.g. 4/7) |
| UX-P0-08 | Interrogation | **Edit prior answer** — discoverable hover/edit | Hover reveals edit; downstream answers preserved (P2-EC-02); toast confirms |
| UX-P0-09 | Workspace | **Lock CTA clarity** — “Finalize v{N} for export” | Single primary action; explains snapshot vs draft |
| UX-P0-10 | Export launch | **Handoff failure ladder** — install link + copy deep link + download fallback | All three visible when `launchIdeHandoff` fails or IDE does not open |
| UX-P0-11 | Extension setup | **Pending workspace copy** — `pending:{archId}` | Setup panel explains “Pick a folder in VS Code to write artifacts” |
| UX-P0-12 | Auth | **Clerk production path** — E2E smoke | Sign up → create → workspace without dev modal (staging Clerk keys) |
| UX-P0-13 | Global | **`docs/05` UX audit** — 13 non-negotiables checklist | Document pass/fail per rule; fix gaps |

### P1 — High value (still mock-backed)

| ID | Area | Improvement | Acceptance criteria |
|----|------|-------------|---------------------|
| UX-P1-01 | Generation overlay | **Live node preview** — mini canvas or node list during stream | ≥3 nodes appear incrementally; first node clickable → skeleton trace |
| UX-P1-02 | Workspace | **Decision Trace as default right panel** on node select | No tab hunting; trace loads <300ms perceived |
| UX-P1-03 | Workspace | **Lineage graph entry** — obvious toggle from trace | User can open full graph without losing canvas context |
| UX-P1-04 | Workspace | **Re-export toast** — “IDE will refresh on save / WS update” | After export/lock, web confirms cross-surface sync |
| UX-P1-05 | Dashboard | **Card status model** — interrogating / generating / ready / exported / drift | Icons + sub-text; last activity timestamp |
| UX-P1-06 | Dashboard | **Empty state** — new user → landing CTA | No dead dashboard |
| UX-P1-07 | Landing | **Import chips** — wire UI to session seed (mock JSON ok) | Upload/paste updates interrogation “context” badge |
| UX-P1-08 | Interrogation | **Keyboard legend** — `1–4`, Enter, Submit, `⌘↵` on landing | Matches `docs/05`; visible on first question |
| UX-P1-09 | IDE extension | **Normal panel** — “Open dashboard” + architecture name/version | Closes loop back to web |
| UX-P1-10 | IDE extension | **Drift panel** — equal-weight Ignore / Exception / Accept fix | Per `docs/05`; 3s undo toast on apply |
| UX-P1-11 | Cursor export | **Simplified handoff** — 2-step max or copy-link primary | Cursor users not forced through 4-step wizard |

### P2 — Polish & fast-follow

| ID | Area | Improvement | Notes |
|----|------|-------------|-------|
| UX-P2-01 | Dashboard | **Live drift on cards** | Needs WS/API aggregation (PRD fast-follow); after UX-P1-05 |
| UX-P2-02 | Generation | **Sound/haptics** | Optional; off by default |
| UX-P2-03 | Workspace | **Onboarding tooltip tour** | First visit only |
| UX-P2-04 | Analytics | **Loop funnel events** | create → lock → export → IDE active (MVP-AN-01) |
| UX-P2-05 | a11y | **Focus trap + ARIA on modals** | Export overlay, dev sign-in, drift |
| UX-P2-06 | perf | **Skeleton loaders** | Workspace detail, lineage, dashboard cards |

---

## Suggested implementation phases (UX Track)

| Phase | Theme | IDs | Gate |
|-------|-------|-----|------|
| **UX-A** | Generation trust | P0-01 – P0-05, P1-01 | `gate:ux-a` — Playwright slow-gen + failure + reconnect |
| **UX-B** | Interrogation & resume | P0-06 – P0-08, P1-07 – P1-08 | `gate:ux-b` — resume E2E |
| **UX-C** | Workspace & lineage feel | P0-09, P1-02 – P1-04 | `gate:ux-c` — trace default E2E |
| **UX-D** | Export, IDE, dashboard | P0-10 – P0-11, P1-05 – P1-06, P1-09 – P1-11 | `gate:ux-d` |
| **UX-E** | Spec audit + Clerk staging | P0-12 – P0-13 | `gate:ux-e` |

Add scripts to root `package.json` when implementation starts, e.g.:

```json
"gate:ux-a": "pnpm --filter @architectai/web typecheck && pnpm --filter @architectai/web test && pnpm --filter @architectai/web exec playwright test e2e/ux-generation.spec.ts"
```

**Implementation detail:** see `ux_implementation_plan.md`. **Gate checklist:** see `TEST_PLAN.md` UX Track section.

---

## Thin API contracts (UX Track only)

Keep backend changes minimal and mock-friendly:

| Endpoint / behavior | Purpose | UX phase |
|--------------------|---------|----------|
| `GET /api/interrogate/sessions?status=active` | Resume list | UX-B |
| `GET /api/generate/jobs/:architectureId/status` | Overlay recovery after refresh | UX-A |
| SSE `progress` payload with `phase` enum | Phase labels | UX-A |
| Dev-only `POST /api/generate/simulate-slow` or query flag | Slow stream | UX-A |
| Dashboard `GET /api/architectures` enriched with `lastActivityAt`, `exportIde` | Card status | UX-D |

Do **not** change interrogation/generation semantics for LLM in this track—only surfaces and recovery.

---

## Simulating production without LLM

| Technique | Use for |
|-----------|---------|
| **Slow generation flag** | Overlay pacing, cancel, reconnect |
| **Forced error routes** (Playwright `page.route`) | Failure panels (already used in Phase I) |
| **Fixture architectures** | Rich canvas + lineage demo |
| **Static “why this question” copy** | Per category until LLM adaptive copy |
| **Recorded SSE fixture file** | Visual regression of stream UI |

---

## Testing strategy (UX Track)

| Type | Focus |
|------|-------|
| **Playwright** | Every P0 flow; slow-gen timeout 45s; failure recovery |
| **Vitest** | Overlay state machine, `shouldAutoStartGeneration`, panel mode helpers |
| **Manual script** | `docs/05` checklist walkthrough (15 min) |
| **Visual** | Optional: Chromatic/Percy on overlay + workspace (P2) |

---

## Definition of done (UX Track)

UX Track is complete when:

1. All **UX-P0** items pass acceptance criteria with **mock backend**.
2. `docs/05` audit documented (≤3 intentional deferrals).
3. Staging Clerk path works end-to-end.
4. A new teammate can run the full loop in **&lt;5 minutes** and describe next steps without help.
5. `TEST_PLAN.md` updated; `pnpm gate:ux-a` … `gate:ux-e` green.

Then begin **`LLM_PRODUCTION_INTEGRATION.md`** without re-litigating layout or failure shells.

---

## §8 Execution strategy — best approach for your plan

### Your idea: UX first, then backend/LLM

**This is a good approach** for ArchitectAI because:

1. **The moat is experiential** — Decision Lineage and governance must *feel* primary; that is layout, copy, and pacing, not model weights.
2. **Mock data is stable** — you can iterate on UI in CI while LLM evals are flaky and expensive.
3. **Real LLM will expose new failures** — if failure/reconnect/slow overlays already exist, you only tune copy and timeouts when Opus runs 30s—not redesign mid-flight.

### Caveats (avoid these traps)

| Trap | Better approach |
|------|-----------------|
| “Pure frontend” UX | Add **thin APIs** above; don’t hack-only in `sessionStorage` |
| Perfect pixels before flows | Ship **UX-A (generation trust)** first — highest drop-off risk |
| Ignoring extension | IDE is half the loop; **UX-D** is not optional |
| Deferring all errors until LLM | **Simulate** errors now (P0-04, P0-05) |
| Big-bang UX rewrite | **One gate per UX phase** (A→E) |

### Suggested calendar

```
Week 1–2   UX-A  Generation overlay (slow, cancel, fail, reconnect)
Week 2–3   UX-B  Interrogation + resume
Week 3–4   UX-C  Workspace / Decision Trace prominence
Week 4–5   UX-D  Export, extension copy, dashboard cards
Week 5–6   UX-E  Spec audit + Clerk staging E2E
Week 6+    LLM Track (see LLM_PRODUCTION_INTEGRATION.md)
```

### What to do in parallel (optional, 1 developer)

- **Analytics events** (UX-P2-04) — low risk, helps both tracks
- **Package rename** `architectai` → `@architectai/cursor-extension` — unblocks gates

### What not to do in UX Track

- Swap mock provider for Anthropic
- RAG / pgvector
- Dashboard live drift sync (unless API ready)—mark P2
- Terraform/Pulumi export

---

## Traceability

| Source | Maps to |
|--------|---------|
| Prior evaluation (2026-05-29) | This backlog |
| `TEST_PLAN.md` H-EC-03/04, MVP-EC-01, `docs/05` | UX-P0-05, P0-10, P0-13 |
| `changes_implementation_plan_2.md` REQ-10/11 | Baseline complete; UX-D extends I |
| `IMPLEMENTATION_PLAN.md` Phase 7.x | After UX + LLM tracks |

---

## Next action

1. Agree phase order (default: **UX-A → E**).
2. Add `TEST_PLAN.md` section **UX Track** when UX-A starts.
3. Implement **UX-P0-02 + P0-04 + P0-05** first (biggest “production feel” ROI).
