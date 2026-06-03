# ArchitectAI — Phase-Wise Test Plan & Edge Cases

**Version:** 1.0
**Date:** 2026-05-29
**Companion:** `IMPLEMENTATION_PLAN.md` (phases) · `new_PRD.md` (intent) · `new_architecture.md` (design) · `docs/01–05` (specs)

> **Purpose.** A per-phase test specification so every phase is validated *as it is built* — happy paths, edge cases, failure modes, and a hard **test gate** that maps to the phase's exit criteria. No phase advances until its gate is green. This is how we keep the application error-free end-to-end.

## How to use this document

- **Test ID scheme:** `P{phase}-{type}-{n}` — types: `UT` unit, `IT` integration, `CT` contract (OpenAPI), `E2E` end-to-end, `PERF` performance, `SEC` security, `EC` edge case.
- **Tooling** (per `new_architecture.md §3.1`): Vitest (unit), Supertest + Postgres test container (API/IT), Playwright (E2E), k6/Artillery (PERF), LLM eval goldens (AI).
- **Gate rule:** a phase is "done" only when **all** its happy-path tests pass, **all** listed edge cases are handled (pass or documented-as-acceptable), and the **Test Gate** checklist is fully checked.
- **Severity tags on edge cases:** 🔴 must-fix (blocks gate) · 🟡 should-fix · ⚪ nice-to-have.

---

## Phase 0 — Foundations & Scaffolding

**What we're proving:** the monorepo builds, the local stack boots, CI is green, shared types are importable.

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| P0-UT-01 | `pnpm install` at root | All workspaces resolve; no peer-dep errors |
| P0-UT-02 | `pnpm build` (Turborepo) | All packages compile; cached on re-run |
| P0-UT-03 | Import a `docs/02` type from `packages/shared` into `apps/api` and `apps/web` | Type resolves; `tsc --noEmit` passes in both |
| P0-IT-01 | `docker compose up` | Postgres 16 + Redis 7 healthy; ports reachable |
| P0-IT-02 | `GET /healthz` after `pnpm dev` | `200 {status:"ok"}` |
| P0-CI-01 | Push to branch | CI runs install→lint→typecheck→test→build, all green |

### Edge cases & failure scenarios
- 🔴 **P0-EC-01** Node version mismatch (not 22 LTS) → `engines` field + CI matrix fails fast with a clear message.
- 🔴 **P0-EC-02** Missing `.env` on `pnpm dev` → app exits with a **named** error listing missing vars (validate env with Zod at boot), not a stack trace.
- 🟡 **P0-EC-03** `docker compose` port already in use (5432/6379) → documented override via env; compose uses configurable host ports.
- 🟡 **P0-EC-04** Strict TS catches an `any` leak from shared types → build fails (proves `strict` is actually on).
- ⚪ **P0-EC-05** Turborepo cache poisoning → `turbo run build --force` recovers cleanly.
- 🔴 **P0-EC-06** Lint/commit hooks bypassable → Husky + commitlint reject a malformed commit message locally.

### ✅ Test Gate
- [ ] `pnpm build` green across all workspaces (cold + cached).
- [ ] `docker compose up` boots Postgres + Redis; `/healthz` returns 200.
- [ ] Shared types importable from web **and** api with strict TS.
- [ ] CI pipeline green on a clean PR; fails correctly on a seeded lint/type error.
- [ ] Boot-time env validation present (fails closed with named vars).

---

## Phase 1 — Data Layer & API Skeleton (auth-upfront, RLS)

**What we're proving:** multi-tenant isolation is airtight, auth is mandatory, the API conforms to OpenAPI, rate limits hold.

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| P1-IT-01 | Run Drizzle migrations on fresh DB | All `docs/03` tables/enums/indexes/partitions/triggers created |
| P1-IT-02 | Seed default ruleset | Rules present and queryable |
| P1-IT-03 | Authenticated `POST /architectures` then `GET` | Round-trips with correct `organization_id` |
| P1-CT-01 | Every implemented route vs `docs/04` | Request/response schemas validate (express-openapi-validator) |
| P1-IT-04 | `pg_trgm` search on `architectures.name` | Fuzzy match returns expected rows; pagination correct |
| P1-IT-05 | Clerk webhook → user/org provisioning | User + org rows created; role assigned |
| P1-IT-06 | Audit write helper + `GET /audit` (role-gated) | Event appended; readable only by `governance_lead` |

### Edge cases & failure scenarios
- 🔴 **P1-SEC-01 (RLS isolation)** Org A token reading org B's architecture by ID → **404/empty**, never B's data. *Fail-closed.*
- 🔴 **P1-SEC-02** Request **without** `SET LOCAL` tenant context → query returns **zero rows** (RLS default-deny), not all rows.
- 🔴 **P1-SEC-03** Missing/expired/invalid JWT on any non-`/healthz` route → `401`; no route is accidentally public.
- 🔴 **P1-SEC-04** Role escalation: `developer` hits `governance_lead`-only `GET /audit` → `403`.
- 🔴 **P1-EC-01** Cross-tenant FK injection (create child row referencing another org's parent) → rejected by RLS/FK, audited.
- 🟡 **P1-EC-02** Rate limit boundary: 10th generate req passes, 11th in window → `429` with `Retry-After`.
- 🟡 **P1-EC-03** Concurrent writes to same architecture → optimistic concurrency / last-writer rules defined; no lost-update corruption.
- 🟡 **P1-EC-04** Migration idempotency / forward-only: re-run migrations → no-op, no drift; a down-migration is rejected by policy.
- 🟡 **P1-EC-05** Malformed body (extra/missing fields, wrong types) → `400` with field-level error from OpenAPI validator, not a 500.
- 🟡 **P1-EC-06** Audit partition rollover (month boundary) → writes land in the correct monthly partition.
- ⚪ **P1-EC-07** Unicode/emoji + 10k-char name in search → handled, indexed, no overflow.
- 🔴 **P1-EC-08 (lineage tables, D4)** Insert lineage node/edge for org A; org B cannot read → same RLS policy enforced on `decision_lineage_*` and `decision_traces`.

### ✅ Test Gate
- [ ] **Fail-closed RLS proven**: automated suite shows org A ⊥ org B across *every* tenant table (incl. lineage tables).
- [ ] No route except `/healthz` is reachable unauthenticated.
- [ ] Role checks enforced (route + RLS, defense in depth).
- [ ] 100% of implemented routes pass OpenAPI contract tests.
- [ ] Rate limits enforced at boundaries with correct headers.
- [ ] Migrations forward-only + idempotent; triggers verified.

---

## Phase 2 — Create A: Landing (auth-gated) + Interrogation

**What we're proving:** an authenticated user completes the adaptive ≤7-question interrogation, autosaved, with no data loss on edit.

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| P2-IT-01 | `POST /interrogate/start` with valid requirement | Session created; first question returned |
| P2-IT-02 | `answer` → adaptive next question (Sonnet) | Progress score advances; next Q contextual |
| P2-IT-03 | `skip` optional question | Skipped without blocking; progress reflects it |
| P2-IT-04 | Complete min 3 / max 7 flow | Session marked complete; ready to generate |
| P2-E2E-01 | Landing hero → sign-in → interrogation → autosaved badge | Full flow; refresh resumes from autosave |
| P2-UT-01 | Interrogation eval goldens | Question quality/adaptivity meets golden thresholds |

### Edge cases & failure scenarios
- 🔴 **P2-EC-01 (auth-upfront)** Anonymous user clicks hero CTA → redirected to sign-in; **no** anonymous session created.
- 🔴 **P2-EC-02 (edit safety)** Edit answer #2 of 5 → later answers (#3–5) **preserved**, not wiped; only downstream-dependent Qs re-evaluated. *(Core PRD §6 rule 13.)*
- 🔴 **P2-EC-03** Requirement < 20 chars → client blocks with inline validation; server also rejects (defense in depth).
- 🟡 **P2-EC-04** LLM timeout/error generating next question → graceful retry, then fallback question; user never sees a stack trace.
- 🟡 **P2-EC-05** Hit max 7 questions → flow forces completion; no 8th question.
- 🟡 **P2-EC-06** Below min 3 → "Generate" disabled with reason.
- 🟡 **P2-EC-07** Autosave during network blip → resumes on reconnect; no duplicate sessions.
- 🟡 **P2-EC-08** Prompt-injection in requirement ("ignore previous instructions…") → treated as untrusted content; does not alter system behavior.
- ⚪ **P2-EC-09** Paste huge artifact (e.g. 50KB PRD) → truncation/spanning handled; PRD spans recorded for later lineage.
- 🔴 **P2-EC-10 (UX)** Keyboard: `1–4` selects option, `Enter` confirms, `⌘↵` submits; shortcuts render as `<kbd>`.

### ✅ Test Gate
- [x] End-to-end interrogation works (min 3 / max 7).
- [x] **Editing an answer never loses later answers** (explicit test).
- [x] Auth-upfront enforced (no anonymous flow).
- [x] LLM failures degrade gracefully (retry + fallback).
- [x] Interrogation eval goldens pass.
- [x] Keyboard + `<kbd>` UX rules verified (Playwright).

---

## Phase 3 — Create B: Generation (SSE + provenance capture)

**What we're proving:** a session generates a governed architecture, streamed < 30s P95, with a **complete, referentially-valid Decision Trace** per component, and clean cancel/reconnect.

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| P3-IT-01 | `POST /generate/start` | `202 {architectureId, streamUrl}`; architecture in `draft` |
| P3-IT-02 | SSE stream events | `node|governance|lineage|progress|complete` in valid `GenerationStreamEvent` shape |
| P3-IT-03 | Persistence after complete | services/layers/connections/issues/scores **+ lineage nodes/edges/traces** stored |
| P3-PERF-01 | Load test generation | **P95 < 30s** end-to-end |
| P3-IT-04 | `POST /generate/{id}/cancel` mid-stream | Reverts to `draft`; terminal event sent; no partial corruption |
| P3-E2E-01 | Generation screen live | Node stream + governance checklist + live scores + `~Ns` countdown |

### Edge cases & failure scenarios
- 🔴 **P3-EC-01 (provenance referential integrity, D6)** Model emits a `source.ref` to a **non-existent** requirement/rule → referential-integrity check **rejects/flags** it; fabricated provenance is **never persisted as fact**.
- 🔴 **P3-EC-02 (trace completeness)** A component generated with **no** requirement or no contract → eval gate fails the architecture; cannot reach `ready`.
- 🔴 **P3-EC-03 (SSE reconnect)** Client drops mid-stream and reconnects → resumes from `gen:state` snapshot; no duplicated/missing nodes.
- 🔴 **P3-EC-04 (cross-replica)** SSE consumer on replica B, producer worker on replica A → Redis pub/sub bridges; client still receives all events.
- 🟡 **P3-EC-05** Structured-output validation fails (LLM returns invalid JSON) → bounded repair retry; if still invalid, generation fails cleanly with audit, not a half-saved architecture.
- 🟡 **P3-EC-06** LLM provider 5xx/timeout → gateway fallback model engaged; or job fails with retry; user sees actionable state.
- 🟡 **P3-EC-07** Cancel **after** complete (race) → idempotent; no revert of a finished architecture.
- 🟡 **P3-EC-08** Double `start` for same session → single architecture (dedupe) or clear conflict response; no orphan jobs.
- 🟡 **P3-EC-09** Per-org token budget exceeded → generation blocked with a clear quota message; audited.
- 🟡 **P3-EC-10** Output cap reached (runaway generation) → truncated safely; architecture still valid or fails cleanly.
- ⚪ **P3-EC-11** Empty/degenerate requirement passes interrogation → minimal but valid architecture, traces still present.
- 🔴 **P3-EC-12** Worker crash mid-job → job retried/marked failed; architecture not stuck in permanent `draft` with no signal.

### ✅ Test Gate
- [x] Payloads match `GenerationStreamEvent` (incl. `lineage`).
- [x] **Every generated component has a complete, referentially-valid Decision Trace** (eval gate).
- [x] No fabricated provenance survives (referential-integrity test).
- [x] Reconnect resumes; cross-replica streaming works.
- [x] **P95 < 30s** under load (mock perf smoke).
- [x] Cancel reverts cleanly; worker-crash recovery verified.

---

## Phase 4 — Workspace + Decision Lineage + Lock

**What we're proving:** Decision Trace is the primary panel on node click, the Lineage Graph renders & cross-navigates, only valid provenance shows, and Lock snapshots an exportable version.

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| P4-IT-01 | `GET /architectures/{id}` | Full detail (services/layers/connections/issues/scores) |
| P4-IT-02 | `GET /architectures/{id}/lineage` (D5) | Full `ArchitectureLineage` graph |
| P4-IT-03 | `GET /architectures/{id}/services/{sid}/trace` (D5) | Resolved `DecisionTrace` with embedded nodes |
| P4-E2E-01 | Click a node | Right panel enters **Decision Trace mode** as primary content |
| P4-E2E-02 | Expand a chain step | Reveals `source` (interrogation/PRD-span/rule/metric) + confidence |
| P4-E2E-03 | Lineage Graph toggle | Full typed graph; selecting a node focuses its trace |
| P4-IT-04 | Lock action | `status=ready` ensured; `version` snapshot; audit event |
| P4-IT-05 | "Ask the architecture" `⌘L` (RAG, Sonnet) | Answer grounded in lineage |

### Edge cases & failure scenarios
- 🔴 **P4-EC-01 (anti-hallucination)** A trace node whose `source.ref` did **not** resolve server-side → UI **flags it / hides as fact**, never renders fabricated provenance as truth.
- 🔴 **P4-EC-02 (no tabs)** Right panel mode is driven **only** by `selectedServiceId` (null → AI Reasoning; set → Node Detail/Trace) — **no tab UI** anywhere. *(PRD §6 rule 3.)*
- 🔴 **P4-EC-03 (narration removed)** Old per-layer italic prose narration is **gone**; actionable urgency triage **remains**.
- 🟡 **P4-EC-04** Component with **zero rejected alternatives** → chain renders gracefully ("no alternatives considered") without empty/broken sections.
- 🟡 **P4-EC-05** Component governed by **no** rule → trace shows explicit "no governance rule applied," not a missing/blank node.
- 🟡 **P4-EC-06** Very large architecture (e.g. 50+ nodes) → canvas + Lineage Graph stay performant; no UI freeze.
- 🟡 **P4-EC-07** Cross-navigation from a rejected alternative / rule → jumps to rule definition or downstream component correctly.
- 🟡 **P4-EC-08** Lock when not `ready` (e.g. draft) → blocked with clear reason.
- 🟡 **P4-EC-09** Edit after Lock → `version++`; previous locked version still retrievable as export baseline.
- 🟡 **P4-EC-10** Lineage endpoint for an architecture **mid-generation** → returns partial-but-valid or a clear "not ready" state, never broken graph.
- 🔴 **P4-EC-11 (UX rules)** Dark-only `#090a0f`, `<kbd>` shortcuts, 48px icon toolbar (no sidebar), wrench `size={16}`, layer accordion chevrons — all verified.
- ⚪ **P4-EC-12** Anti-pattern "Clear" badge → shows **3s undo toast** (PRD §6 rule 12).

### ✅ Test Gate
- [x] Node click → Decision Trace as **primary** panel (no tabs).
- [x] Causal chain expands to evidence; unresolved provenance flagged, never shown as fact.
- [x] Lineage Graph renders + cross-navigates.
- [x] Old prose narration removed; triage retained.
- [x] Lock snapshots an exportable version; non-ready lock blocked.
- [x] `docs/05 §8` UX rules verified (checklist + Playwright).

---

## Phase 5 — Governance & Drift Engine (latency-critical core)

**What we're proving:** deterministic detection under 200ms, correct rule matching across all types, full drift lifecycle, and exceptions.

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| P5-PERF-01 | `POST /drift/check` warmed index | **P95 < 200ms**, **no LLM** on hot path |
| P5-PERF-02 | Save → WS alert | **< 500ms** end-to-end |
| P5-UT-01 | Each matcher type (boundary/auth/pattern/naming/contract/dependency) | +/- fixtures: violation detected, clean passes |
| P5-IT-01 | Async enrichment → WS `drift.detected` | `whatHappened`/`impact`/diagrams/`autoFix` delivered |
| P5-IT-02 | `apply-fix` / `ignore` lifecycle | State transitions + `sync_architecture_drift_score` trigger updates score |
| P5-IT-03 | Exception `request` → `review` (governance_lead) | Workflow + Slack/email notification |
| P5-UT-02 | Autofix renderer | Produces valid `CodeDiff` |

### Edge cases & failure scenarios
- 🔴 **P5-EC-01 (latency under load)** 120 req/min/workspace burst → still **P95 < 200ms**; CI perf gate fails the build if exceeded.
- 🔴 **P5-EC-02 (no LLM on hot path)** Verify `/drift/check` makes **zero** LLM calls (assert via gateway spy).
- 🔴 **P5-EC-03 (cold index)** First check before rule index warmed → either fast cold-path or sub-200ms after a bounded warm; never multi-second.
- 🟡 **P5-EC-04** Unsupported language file (no parser) → tree-sitter fallback or graceful "not analyzed," not a crash.
- 🟡 **P5-EC-05** Syntactically broken source file on save → engine returns "cannot parse" gracefully, no 500.
- 🟡 **P5-EC-06** Hash-memoization correctness: same file twice → cache hit; changed file → cache miss + re-evaluate.
- 🟡 **P5-EC-07** Stale rule index after architecture version bump → index invalidated/rewarmed; old rules not applied.
- 🟡 **P5-EC-08** Conflicting rules (two rules disagree) → deterministic precedence; result stable across runs.
- 🟡 **P5-EC-09** Enrichment LLM fails → detection result still returned (hot path unaffected); enrichment retried/marked degraded.
- 🟡 **P5-EC-10** `apply-fix` on already-fixed/ignored drift → idempotent; score not double-counted.
- 🟡 **P5-EC-11** Exception approved → drift suppressed correctly; audit trail complete.
- 🔴 **P5-EC-12 (token auth)** `/drift/check` with missing/invalid **scoped workspace token** → `401`; user JWT alone is rejected here.
- ⚪ **P5-EC-13** Huge file / monorepo import graph → bounded analysis time; degrades to scoped analysis rather than timeout.

### ✅ Test Gate
- [x] `/drift/check` **P95 < 200ms** under burst (CI gate) with **zero LLM** calls.
- [x] Save→alert **< 500ms**.
- [x] Every rule type has passing +/- fixtures.
- [x] Lifecycle (apply-fix/ignore/exception) consistent; scores never double-count.
- [x] Scoped-token auth enforced on the hot path.
- [x] Autofix validates against `CodeDiff`.

---

## Phase 6 — Bridge: Export Wizard + Dashboard

**What we're proving:** a locked architecture becomes valid IDE-ready artifacts, the workspace token + config pull work, and the dashboard return hub is correct.

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| P6-IT-01 | `POST /architectures/{id}/export` (status=ready) | `.architectai/*` (manifest/rules/boundaries/forbidden-patterns) + contracts; blobs stored; `architecture_exports` row |
| P6-CT-01 | Exported config vs `CursorConfig` schema | Validates exactly |
| P6-IT-02 | `POST /cursor/workspaces` | Row created (hashed local path), scoped token minted, `CursorConfig` returned |
| P6-IT-03 | `GET /cursor/workspaces/{id}/config` (token auth) | Config pulled by stub client |
| P6-E2E-01 | Export Wizard 4-step | choose workspace+format → register → convert (artifacts) → deep-link URL well-formed |
| P6-E2E-02 | Dashboard | `MyProjectCard` vs `TopArchCard` distinct; `⌘K`, `⌘N`; Drift Center badge |
| P6-IT-04 | Re-export on version bump | Emits `architecture.updated` |

### Edge cases & failure scenarios
- 🔴 **P6-EC-01** Export when **not** `ready` → blocked with clear error; no partial artifacts.
- 🔴 **P6-EC-02 (format coverage)** Export each MVP format — **cursor-config, openapi, adr-markdown** — all valid; terraform/pulumi absent/optional, not broken stubs.
- 🟡 **P6-EC-03** Deep-link URL with special chars in token/arch → properly URL-encoded; handler parses correctly.
- 🟡 **P6-EC-04** Workspace token expiry/revocation → config pull returns `401`; re-mint path works.
- 🟡 **P6-EC-05** Object storage write failure → export fails cleanly with retry; no dangling `architecture_exports` row pointing to missing blob.
- 🟡 **P6-EC-06 (return-home routing)** User with projects → Dashboard; user with **zero** projects → Landing/empty-state.
- 🟡 **P6-EC-07** Dashboard with many projects → pagination/perf OK; cards render correct status.
- 🟡 **P6-EC-08** Concurrent re-export (two tabs) → single coherent version bump; `architecture.updated` not duplicated harmfully.
- ⚪ **P6-EC-09** Share-with-team link → respects org RBAC (viewer can't export).
- 🔴 **P6-EC-10** Manifest version stamp matches the **locked** version (not latest draft) — prevents web/IDE contract drift.

### ✅ Test Gate
- [x] Export produces valid `.architectai/*` matching `CursorConfig`; all 3 MVP formats valid.
- [x] Workspace token issued; config pull works (stub client).
- [x] Deep-link URL well-formed + encoded.
- [x] Dashboard card types + home routing match `docs/05 §3.6`.
- [x] Version stamp integrity (locked version, not draft).
- [x] Export blocked when not `ready`.

---

## Phase 7 — Cursor / VS Code Extension (closes the loop)

**What we're proving:** the IDE half — deep-link connect, governed steady-state, drift detection & fix, and live version updates.

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| P7-E2E-01 | Deep-link `cursor://architectai/connect` | URI handler fires; token stored; config pulled; `.architectai/*` written |
| P7-E2E-02 | Setup (S6) → Normal (S7) | "Governed" + model badge; MONITORING ACTIVE checklist (`AP-001/002/003 ✓ Clear`) |
| P7-E2E-03 | Save violating import | `POST /drift/check`; red gutter + wavy underline + status bar "⚠ N Critical Drift" |
| P7-E2E-04 | Drift Panel (S8) | what-happened, Agreed-vs-Current diff, impact, auto-fix diff |
| P7-E2E-05 | "Accept & Apply Fix" | Fix applied; score restored; back to Normal |
| P7-E2E-06 | WS `architecture.updated` after web re-export | Extension re-pulls contracts |

### Edge cases & failure scenarios
- 🔴 **P7-EC-01 (deep-link failure)** OS/browser blocks the `cursor://` scheme → **downloadable `.architectai/` fallback** path works; user not stranded.
- 🔴 **P7-EC-02 (cross-OS)** Deep-link verified on **macOS and Windows** (+ documented Linux behavior).
- 🟡 **P7-EC-03** Token invalid/expired at config pull → clear re-auth prompt, not a silent failure.
- 🟡 **P7-EC-04** Save on an **ignored** path → no drift check fired (respects monitored/ignored paths).
- 🟡 **P7-EC-05** Rapid saves (debounce) → no request storm; latency budget held.
- 🟡 **P7-EC-06** Offline/server unreachable on save → graceful degraded mode; queues or shows "monitoring paused," no crash.
- 🟡 **P7-EC-07** WS disconnect/reconnect → enrichment + `architecture.updated` resume; no missed critical updates.
- 🟡 **P7-EC-08** Auto-fix conflicts with concurrent manual edit → safe apply or clear conflict prompt; never silent overwrite.
- 🟡 **P7-EC-09 (UX rules)** "Accept & Apply Fix" wording; **equal-weight** "Ignore drift" / "Request Exception" (never amber); drift-score "deducts from governance grade" sub-text; `⎋` dismiss.
- 🟡 **P7-EC-10** Workspace path moved/renamed → re-bind flow; stale `workspace_hash` handled.
- ⚪ **P7-EC-11** Multiple workspaces / multi-root → each binds to correct architecture.

### ✅ Test Gate (full-loop demo)
- [x] Web create → Lock → Export → **deep-link opens IDE** → Setup pulls config.
- [x] Edit violating import → red gutter + toast → Drift Panel → Accept & Apply Fix → score restored → Normal.
- [x] Re-export from web updates IDE contracts (`architecture.updated`).
- [x] Deep-link fallback verified; cross-OS verified.
- [x] All `docs/05 §8` extension UX rules satisfied.

---

## Changes Batch 1 — Phase D (Canvas confidence + relationships) ✅

**REQ-5, REQ-6** · Gate: `pnpm gate:phase-d`

| ID | Test | Expected |
|---|---|---|
| D-UT-01 | `confidenceTierFromInputs` | Critical issue → `critical` at score 90 |
| D-UT-02 | Score thresholds | 79 → partial, 80 → high |
| D-IT-01 | Architecture detail | `kind` on connections; `confidenceTier` on services |
| D-E2E-01 | Workspace nodes | `data-tier` present |
| D-E2E-02 | Canvas edges | ≥2 edges in mock arch |
| D-E2E-03 | Minimap + legend + swimlanes | Visible |
| D-EC-01 | Zero connections | Empty edge list (UT) |
| D-EC-02 | Focus mode | `data-tier` preserved on nodes |
| D-EC-03 | Color-blind | `AlertCircle` on partial/critical |

---

## Changes Batch 1 — Phase G (Dashboard IDE button) ✅

**REQ-4** · Gate: `pnpm gate:phase-g`

| ID | Test | Expected |
|---|---|---|
| G-IT-01 | `GET …/ide-handoff` | `vscode://` deep link; no token in response |
| G-IT-02 | `GET /architectures` | `lastExportIde` + `lastWorkspaceId`; no `apiToken` |
| G-E2E-01 | Dashboard card | `Open in Visual Studio` after export |
| G-E2E-02 | Open IDE click | Hand-off URL uses `vscode://` scheme |
| G-EC-01 | Never exported | `Export` CTA, no Open IDE |
| G-EC-02 | No auth | `401` on ide-handoff |
| G-EC-03 | No workspace | `409`; UI routes to export wizard |

---

## Changes Batch 1 — Phase F (Decision lineage surfacing) ✅

**REQ-9** · Gate: `pnpm gate:phase-f`

| ID | Test | Expected |
|---|---|---|
| F-UT-01 | `rankCriticalDecisions` | Critical issue outranks high-confidence trace |
| F-UT-02 | Unresolved provenance | `hasUnresolvedProvenance` + critical severity |
| F-UT-03 | `buildDecisionNarrative` | Prose includes summary + chain evidence |
| F-IT-01 | `GET …/lineage/topics` | ≤5 topics; stable sort |
| F-IT-02 | `GET …/lineage/decisions/:id` | Chain steps with `source.resolved` |
| F-IT-03 | `GET …/trace` | `narrative` field present |
| F-IT-04 | `POST …/decision-chat` | Updates `userDecisionNote` + reply |
| F-E2E-01 | Overview | ≤5 critical decision cards |
| F-E2E-02 | Node select | `decision-lineage-layer` + narrative + bottom chat |
| F-E2E-03 | Expand chain | Trace steps visible |
| F-E2E-04 | Decision chat | Reply after refinement |
| F-E2E-05 | Lineage graph | Show all / back to critical |
| F-EC-01 | Panel layout | No tabs; no contract CRUD section |

---

## Changes Batch 1 — Phase C (IDE export picker + VS launch) ✅

**REQ-3** · Gate: `pnpm gate:phase-c`

| ID | Test | Expected |
|---|---|---|
| C-IT-01 | Export without prior lock | 200 + `architecture.locked` audit |
| C-IT-02 | `ideTarget: vscode` | Stored on `architecture_exports` |
| C-E2E-01 | IDE picker | Visual Studio first + Recommended |
| C-E2E-02 | Export wizard | Deep link `vscode://architectai/connect` |
| C-E2E-03 | Workspace | No `lock-architecture-btn` |
| C-UT-01 | `buildIdeDeepLink('vscode', …)` | Correct scheme + encoding |
| C-UT-02 | Extension `parseConnectUri` | Parses `vscode://` |
| C-EC-01 | `status !== ready` | Export buttons disabled |
| C-EC-03 | Lock fails | Wizard error; no partial export |
| C-EC-04 | Antigravity | Copy-only hand-off |

---

## UX Track — Production feel (pre-LLM) — planned

**Companion:** `UX_PRODUCTION_IMPROVEMENTS.md` (backlog) · `ux_implementation_plan.md` (file changes + full test matrix)  
**Gate:** `pnpm gate:ux` (runs `gate:ux-a` … `gate:ux-e`)

> Implement **before** `LLM_PRODUCTION_INTEGRATION.md`. Mock backend remains CI default.

### Phase UX-A — Generation overlay trust

| ID | Type | Expected |
|----|------|----------|
| UXA-IT-01 | IT | SSE `progress` events include `phase` |
| UXA-IT-02 | IT | `GET /generate/jobs/:id/status` while running |
| UXA-IT-03 | IT | Status `complete` after stream ends |
| UXA-E2E-01 | E2E | Phase steps + auto workspace |
| UXA-E2E-02 | E2E | Slow mode ≥8s visible |
| UXA-E2E-03 | E2E | Cancel → confirm → interrogation |
| UXA-E2E-04 | E2E | Node preview ≥3 rows |
| UXA-EC-01 | 🔴 EC | Start gen 500 → retry panel |
| UXA-EC-02 | 🔴 EC | SSE abort → reconnect or fail |
| UXA-EC-03 | 🔴 EC | Refresh mid-gen → recover (H-EC-04) |
| UXA-EC-04 | 🔴 EC | Cancel + retry new job |
| UXA-EC-06 | 🔴 EC | Stream timeout → actionable message |
| UXA-EC-11 | 🔴 EC | Test error header → edit answers |

**Gate:** `pnpm gate:ux-a`

### Phase UX-B — Interrogation & resume

| ID | Type | Expected |
|----|------|----------|
| UXB-IT-01 | IT | List active sessions (tenant-scoped) |
| UXB-E2E-01 | E2E | Question context + keyboard legend |
| UXB-E2E-02 | E2E | Resume 3/7 from dashboard |
| UXB-E2E-03 | E2E | Edit Q2 preserves Q3–4 |
| UXB-EC-01 | 🔴 EC | Invalid session URL |
| UXB-EC-03 | 🔴 EC | Completed session CTA ≠ Continue |
| UXB-EC-04 | 🔴 EC | Edit downstream preserved |

**Gate:** `pnpm gate:ux-b`

### Phase UX-C — Workspace & lineage

| ID | Type | Expected |
|----|------|----------|
| UXC-E2E-01 | E2E | Trace panel default on node click |
| UXC-E2E-02 | E2E | Lineage drawer from trace |
| UXC-E2E-03 | E2E | Lock CTA shows version |
| UXC-EC-01 | 🔴 EC | Missing trace empty state |
| UXC-EC-02 | 🔴 EC | Rapid node switch no stale trace |

**Gate:** `pnpm gate:ux-c`

### Phase UX-D — Export, IDE, dashboard

| ID | Type | Expected |
|----|------|----------|
| UXD-IT-01 | IT | Architecture list enriched metadata |
| UXD-E2E-02 | E2E | Handoff failure ladder (3 actions) |
| UXD-E2E-03 | E2E | Dashboard empty state |
| UXD-EC-01 | 🔴 EC | Clipboard denied fallback |
| UXD-EC-03 | 🔴 EC | Cursor copy-link path ≤2 steps |

**Gate:** `pnpm gate:ux-d`

### Phase UX-E — Spec audit + Clerk

| ID | Type | Expected |
|----|------|----------|
| UXE-E2E-02 | E2E | `<kbd>` on landing/interrogation |
| UXE-E2E-04 | E2E | Clerk staging (CLERK_E2E=1) |
| UXE-EC-02 | 🔴 EC | `docs/UX_SPEC_AUDIT.md` ≤3 deferrals |

**Gate:** `pnpm gate:ux-e` · optional `pnpm gate:ux-clerk`

### ✅ UX Track Ship Gate

- [ ] `pnpm gate:ux` green
- [ ] `pnpm gate:phase-h` + `gate:phase-i` regression green
- [ ] All UX-P0 backlog items in `UX_PRODUCTION_IMPROVEMENTS.md` met
- [ ] `docs/UX_SPEC_AUDIT.md` published

---

## Changes Batch 2 — Phase H (Seamless interrogation → workspace) ✅

**REQ-10** · Gate: `pnpm gate:phase-h`

| ID | Test | Expected |
|---|---|---|
| H-IT-01 | Answer Q7 | `session.status === complete` |
| H-IT-02 | 3 answers only | Session stays `active`; 4 questions in DB |
| H-IT-03 | Freeform-only POST | Accepted; `freeformAnswer` stored |
| H-IT-04 | `generate/start` before complete | 422 validation |
| H-IT-05 | `generate/start` after complete | 202 + `architectureId` |
| H-UT-01 | `submitFreeformAnswer` | POST body has `freeformAnswer` only |
| H-UT-02 | `shouldAutoStartGeneration` | False at 6; true when `sessionComplete` |
| H-EC-01 | Empty freeform | Submit disabled |
| H-E2E-01 | 7 options → overlay → workspace | No Generate click; auto-nav |
| H-E2E-02 | Freeform Submit | Next question |
| H-E2E-03 | Option click | Auto-advance |
| H-E2E-04 | First question | No `generate-architecture-cta` |

---

## Changes Batch 2 — Phase I (IDE-native VS export) ✅

**REQ-11** · Gate: `pnpm gate:phase-i`

| ID | Test | Expected |
|---|---|---|
| I-IT-01 | POST export/ide-handoff | `vscode://` link, `workspaceId`, `bundleReady` |
| I-IT-02 | GET export-bundle (token) | cursor-config JSON with manifest/rules |
| I-IT-03 | Cross-workspace token | 403 |
| I-EC-01 | export/ide-handoff on generating arch | 409 |
| I-EC-04 | export-bundle without export | 404 |
| I-EXT-01 | Deep link + pending path | workspaceId in URI |
| I-EXT-02 | bundle-writer | manifest, rules, config files |
| I-E2E-01 | VS picker | Launch overlay + vscode deep link |
| I-EC-02 | Launch overlay | Install extension link |
| I-EC-01 (web) | Mock 409 | Error in overlay |
| I-EC-03 | Extension UT | `postConnectPanelMode` → setup when no folder |
| I-EC-04 | Extension UT | Bundle miss → setup; API 404 throws |
| I-EC-05 | Extension UT | WS `architecture.updated` delivered |

**Deferred:** I-E2E-02 (VS Code extension harness — requires VSIX sideload in CI).

---

## Changes Batch 1 — Phase B (Interrogation auto-advance) ✅

**REQ-8** · Gate: `pnpm gate:phase-b`

| ID | Test | Expected |
|---|---|---|
| B-E2E-01 | Click option | Next question; no Apply & Continue |
| B-E2E-02 | Key `2` | Auto-submit + autosaved |
| B-E2E-03 | Edit prior answer | Save edit required |
| B-UT-01 | Double parallel submit | One POST |
| B-EC-01 | API failure | Error shown; same question |
| B-EC-02 | 3 auto-answers | More questions remain (Phase H: no Generate CTA) |
| B-EC-03 | Skip | Advances without option select |
| B-EC | Freeform + option | Autosaved with answer |

---

## Changes Batch 1 — Phase A (Profile + sign-out) ✅

**REQ-1, REQ-2** · Gate: `pnpm gate:phase-a`

| ID | Test | Expected |
|---|---|---|
| A-UT-01 | `UserProfileBar` dev mode | Profile icon + Sign out visible when token set |
| A-E2E-01 | Sign out workspace | `/`; `/dashboard` blocked |
| A-E2E-02…05 | Sign out dashboard, interrogation, generation, export | `/` |
| A-EC-02 | Double sign-out | No crash; session cleared |
| A-EC-03 | Browser back after sign out | Stays on `/` |
| A-EC-05 | Signed in → sign out | Profile hidden after |

---

## 🚩 Phase 7.x — Public Feedback MVP (Ship Gate)

**What we're proving:** the complete loop runs in production on lean hosting, instrumented, within budgets.

### Tests & checks
| ID | Test | Expected |
|---|---|---|
| MVP-SMK-01 | Prod smoke: full loop by a real external tester | Create → IDE active, no blockers |
| MVP-PERF-01 | Prod latency | Generation < 30s; drift < 200ms; SSE/WS reconnect works |
| MVP-OBS-01 | Errors surface in Sentry; pino logs structured | Traceable incidents |
| MVP-OBS-02 | LLM cost visible per request; per-org budgets active | Cost observable |
| MVP-SEC-01 | RLS + scoped-token + auth checks in prod config | No regressions vs Phases 1/5 |
| MVP-AN-01 | **Loop completion rate** tracked (create → IDE active) | Analytics firing |

### Edge cases
- 🔴 **MVP-EC-01** Deep-link hand-off on a clean machine without the extension installed → clear install prompt + fallback.
- 🟡 **MVP-EC-02** Cold-start latency on free-tier hosting (scale-to-zero) → first request within acceptable bound or warmed.
- 🟡 **MVP-EC-03** Secret/env misconfig in prod → fail-closed boot (from P0 env validation), not silent insecure mode.
- 🟡 **MVP-EC-04** Free-tier DB/Redis connection limits under concurrent users → pooling configured; no exhaustion crash.

### Pre-ship (local / CI)
- [x] `pnpm gate:pre-ship` — phase 7 gate + `full-loop.smoke.test.ts` (interrogate → gen → lock → export → IDE → drift fix).
- [x] Local dev auth: `POST /__dev__/provision` + web **Create dev user & continue** (no Clerk keys).
- [ ] `./scripts/local-smoke.sh` against running local API (requires Docker Postgres + Redis).

### ✅ Ship Gate
- [ ] External users complete the full loop in production.
- [ ] Latency budgets hold in prod (gen <30s, drift <200ms).
- [ ] Errors in Sentry; LLM cost per request visible; fixed infra ≈ $0–50/mo.
- [ ] Loop-completion analytics flowing; feedback capture live.

---

## Phase 8 — Scale-Up & Compliance (deferred; by config)

**What we're proving:** enterprise scale/availability/compliance without a rewrite.

| ID | Test | Expected |
|---|---|---|
| P8-IT-01 | Multi-AZ RDS failover rehearsal | Failover within RTO; no data loss |
| P8-PERF-01 | k6/Artillery at scale | Gen <30s, drift <200ms hold at scale-up tier |
| P8-IT-02 | Multi-region routing (`region`) | EU traffic stays in EU (GDPR) |
| P8-SEC-01 | SSO/SAML (Okta/Azure-AD) | Enterprise login + role mapping |
| P8-SEC-02 | Pen-test, dep/secret scanning gates, KMS at rest | SOC2 Type II controls evidenced |
| P8-IT-03 | GitHub App: repo picker + PR-diff governance | Violations flagged in CI |
| P8-IT-04 | Queue retries/DLQ; blue/green deploy | Resilience verified; zero-downtime deploy |

**Edge cases:** 🟡 region failover under load · 🟡 SSO edge (de-provisioned user) · 🟡 DLQ replay idempotency · 🟡 multi-replica SSE/WS fan-out at scale.

### ✅ Test Gate
- [ ] NFR targets met at scale-up tier; SOC2 controls evidenced; multi-region failover rehearsed.

---

## Cross-Cutting Test Suites (run continuously)

| Suite | What it guards | Key tests |
|---|---|---|
| **Provenance fidelity** | Lineage is trustworthy | Trace-completeness gate; **every `source.ref` resolves**; no fabricated provenance shown as fact (Phases 3–4) |
| **Multi-tenant isolation** | Data leaks | Fail-closed RLS across all tenant tables incl. lineage (Phase 1, regression every phase) |
| **Contract conformance** | API drift | OpenAPI (`docs/04`) request/response validation on every route |
| **Latency budgets** | UX-critical perf | Gen <30s P95; drift <200ms P95; alert <500ms (CI perf gates) |
| **UX non-negotiables** | `docs/05 §8` (13 rules) | Dark-only, `<kbd>`, no right-panel tabs, 48px toolbar, "Accept & Apply Fix", equal-weight Ignore/Exception, drift-score sub-text, always-cancel gen, 2 card types, wrench size=16, accordion chevrons, 3s undo toast, hover-edit answers |
| **Security** | AuthZ/secrets | JWT required everywhere; scoped-token revocation; dep + secret scanning per PR |
| **LLM resilience** | Provider variance | Structured-output validation + repair retry; per-workload fallback; cancellable jobs; token-budget enforcement |
| **Real-time integrity** | Streaming correctness | SSE reconnect via `gen:state`; cross-replica pub/sub; WS reconnect for drift + `architecture.updated` |

---

## Definition of Done (per phase)

A phase is complete when:
1. All happy-path tests pass.
2. All 🔴 edge cases pass; 🟡 pass or are documented-as-acceptable with an owner.
3. The phase **Test Gate** checklist is fully checked.
4. Relevant **cross-cutting suites** are green (no regression in prior phases).
5. New tests are wired into CI (so the gate is enforced on every future PR).

> Source of truth for behavior remains `docs/01–05` + spec deltas D1–D6 (`new_architecture.md §10.1`). When a test and a spec disagree, reconcile against the spec/deltas before changing the test.
