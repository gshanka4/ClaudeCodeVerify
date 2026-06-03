# ArchitectAI — v3.0 Implementation Plan (Verification Delta)

**Version:** 3.0  
**Date:** 2026-05-31  
**Status:** Active — builds on the closed v2.0 loop (Phases 0–7 ✅)  
**Companion documents:**
- `new_PRD_updated.md` (v3.0 product intent — authoritative for this delta)
- `new_PRD.md` (v2.0 loop — preserved, not superseded for mechanics)
- `IMPLEMENTATION_PLAN.md` (v2.0 phases 0–7 — **baseline; do not re-implement**)
- `new_architecture.md` (system design — updated by spec deltas **D7–D10** below)
- `TEST_PLAN.md` (v2.0 tests — regression baseline; all v2 gates must stay green)

> **What this document is.** A complete phase-wise delivery plan for **only the v3.0 delta**: the Verification Pass, Trust Grade, Lock gate, override flow, and surface elevation across existing screens. Each phase includes **deliverables, happy-path tests, edge cases, and a hard test gate** — no phase advances until its gate is green. Assumes Phases 0–7 from `IMPLEMENTATION_PLAN.md` are complete and gate-closed. **No v2.0 feature is removed or re-built.** v2.0 Phase 8 (scale-up/compliance) remains deferred and unchanged.

> **Extension principle (non-negotiable).** Extend existing modules, routes, types, and UI components. Add new files only where a genuinely new subsystem boundary exists (`apps/api/src/verification/`). **Do not fork** generation, lock, export, engine, lineage, or drift code into parallel copies.

---

## How to use this plan

- **Test ID scheme:** `V{phase}-{type}-{n}` — types: `UT` unit, `IT` integration, `CT` contract (OpenAPI), `E2E` end-to-end, `PERF` performance, `SEC` security, `EC` edge case, `REG` regression.
- **Tooling** (unchanged from v2.0): Vitest (unit), Supertest + PGlite/Postgres (API/IT), Playwright (E2E), LLM eval goldens (AI workloads).
- **Gate rule:** a v3 phase is "done" only when **all** its happy-path tests pass, **all** 🔴 edge cases are handled, and the **Test Gate** checklist is fully checked.
- **Severity tags:** 🔴 must-fix (blocks gate) · 🟡 should-fix · ⚪ nice-to-have.
- **Regression rule:** every v3 gate includes prior v3 gates **and** `pnpm gate:phase7` from v2.0. No v2.0 gate is removed.

---

## 1. Baseline — What Already Exists (Do Not Rebuild)

| v2.0 capability | Location / gate | v3.0 role |
|---|---|---|
| Auth, RBAC, RLS, audit | Phase 1 · `pnpm gate:phase1` | Extend audit event types only |
| Interrogation (≤7 Qs) | Phase 2 · `gate:phase2` | Answers become **requirement ground truth** for `coverage.*` |
| Generation SSE + lineage capture | Phase 3 · `gate:phase3` | Triggers Verification Pass on `complete` |
| Referential-integrity guard | `generation/lineage-integrity.ts` | Reused; ungrounded refs → `unverified` findings |
| Workspace + Decision Trace + Lineage Graph | Phase 4 · `gate:phase4` | Add Verification panel **below** trace; canvas verdict layer |
| Lock (version snapshot) | `architectures.service.ts` → `lockArchitecture` | **Modify** to gate on deterministic conflicts |
| Governance rule engine (code-time) | `apps/api/src/engine/` · `gate:phase5` | Reuse matchers for `governance.conformance` on architecture graph |
| Drift hot path + lifecycle | `drift.service.ts` · `gate:phase5` | Unchanged mechanics; feeds Trust Grade (fast-follow) |
| Export + Dashboard + IDE bridge | Phases 6–7 · `gate:phase6/7` | Stamp manifest; show Trust Grade; IDE copy update |

**Current gap:** zero verification tables, endpoints, engine, or UI. `aiTrustScore` / canvas confidence tiers are **generation-time signals**, not independent verification — v3.0 introduces **Trust Grade** as the product trust metric without deleting existing score fields (deprecate in UI only).

---

## 2. Delta Summary — PRD FR → Build Work

| PRD FR | Requirement | Phase | Primary touch |
|---|---|---|---|
| FR-2 | Auto-trigger Verification Pass on generation `complete` | **V3** | `generation/runner.ts` (hook) |
| FR-3 | Tier-1 deterministic checks, P95 < 2s, LLM-free | **V2** | `verification/` engine |
| FR-4 | Tier-2 probabilistic checks, streamed, P95 < 20s | **V5** | `verification/adjudication.ts` + worker |
| FR-5 | Persist findings with full verdict model | **V1** | schema + `verification.service.ts` |
| FR-6 | Canvas verdict projection + stacked panel | **V4** | `ArchitectureCanvas`, `DecisionTracePanel` |
| FR-7 | Lineage Graph verification overlay | **VF** | `LineageGraphView` (fast-follow) |
| FR-8 | Lock gated on deterministic conflicts | **V3** | `lockArchitecture` |
| FR-9 | Override-with-reason → immutable audit | **V3** | `verification-override.service.ts` |
| FR-10 | Export requires completed run + manifest stamp | **V6** | `export.service.ts`, `build-artifacts.ts` |
| FR-11 | Re-run verify on version bump | **V3** | `architectures.service.ts` update path |
| FR-12 | Trust Grade with breakdown | **V2–V4** | `verification/trust-grade.ts` + UI badge |
| FR-13 | Verifier reliability (per-check precision) | **VF** | eval goldens + info affordance |
| FR-14 | Drift unchanged; feeds Trust Grade | **VF** | extend `trust-grade.ts` (fast-follow) |

**MVP scope (verification v1 per PRD §14):** FR-2 through FR-10 for Tier-1 checks + `adjudication.crossmodel` + Trust Grade v1 (verification-only). FR-7, FR-13, drift→grade = fast-follow.

---

## 3. Spec Deltas (authoritative additions to `docs/01–05`)

These are **additive** spec deltas — append to `new_architecture.md §10.1`, do not duplicate existing D1–D6 lineage deltas.

| Delta | Scope | Detail |
|---|---|---|
| **D7** | Shared types | `VerificationRun`, `VerificationFinding`, `VerificationOverride`, `VerificationCheck`, `VerificationVerdict`, `VerificationTier`, `ComponentVerdictRollup`, `TrustGradeBreakdown` in `packages/shared` |
| **D8** | Database | Tables `verification_runs`, `verification_findings`, `verification_overrides`; indexes on `(architecture_id, version)`, `(run_id)`; RLS identical to `architectures`; audit enum values `architecture.verified`, `architecture.override_recorded` |
| **D9** | API | OpenAPI tag `Verification`: `POST …/verify`, `GET …/verification`, `GET …/services/{serviceId}/verification`, `POST …/findings/{findingId}/override`, `GET …/verification/stream/{runId}` (SSE); **modify** `POST …/lock` 409 contract; **modify** export manifest schema |
| **D10** | Frontend | Generation → Verification Pass transition; Workspace panel order (Lineage above Verification); canvas verdict colors; Lock gate modal; Trust Grade badge; UX rules 14–19 from `new_PRD_updated.md §5` |

**Deferred delta (fast-follow):** **D11** — `reference_patterns` pgvector table + `pattern.reference` check; **D12** — `capability_reference` table + `constraint.satisfiability`.

---

## 4. Reuse Matrix — Existing Primitives → Verification Checks

| Check ID | Tier | Reuses (extend, don't copy) | Net-new logic |
|---|---|---|---|
| `coverage.requirement` | deterministic | `decision_traces`, `decision_lineage_nodes`, interrogation session Q&A via `lineage-read.service.ts` | Map each answered question → ≥1 component via trace `requirementNodeIds` |
| `coverage.justification` | deterministic | Same lineage graph | Inverse: each service in `architectures` detail must appear in ≥1 trace's requirements chain |
| `structure.composition` | deterministic | `architectures` services/connections/contracts from `getArchitectureDetail` | Validate required interfaces present; contracts compose (graph walk) |
| `structure.integrity` | deterministic | Services + connections adjacency | Cycle detection, orphan services, dangling connection refs |
| `governance.conformance` | deterministic | `engine/matchers/*`, `toGovernanceRules`, active ruleset from `governance.service.ts` | **Architecture-graph evaluator** (new thin layer in `verification/`) — applies matchers to graph snapshot, not source files |
| `constraint.satisfiability` | deterministic | — | **VF:** capability reference table lookup |
| `adjudication.crossmodel` | probabilistic | `LlmGateway.generateStructured`, prompt registry | New prompt `verification/adjudication-crossmodel`; gateway route **must not** use generation provider |
| `pattern.reference` | probabilistic | pgvector RAG (deferred from Phase 3.x) | **VF:** nearest validated pattern + similarity score |

**Independence rule (hard):** `LlmGateway` gains an explicit `workload: "verification-adjudication"` route. CI test asserts generation provider name ≠ verification provider name when both are configured.

---

## 5. Delivery Map

| Phase | Theme | Outcome | Tier |
|---|---|---|---|
| **V0** | Spec & contracts | D7–D10 documented; shared types stubbed; OpenAPI delta drafted | Prerequisite |
| **V1** | Verification data layer | Tables + RLS + shared types + migration | MVP |
| **V2** | Tier-1 engine + Trust Grade v1 | Deterministic checks + rollup + grade computation | MVP |
| **V3** | Orchestration + gate | Auto-trigger, SSE stream, Lock gate, override, re-run on edit | MVP |
| **V4** | Workspace + Generation UI | Verdict canvas, stacked panel, Lock modal, gen verify view | MVP |
| **V5** | Tier-2 cross-model | Async adjudication streamed into existing run | MVP |
| **V6** | Bridge surfaces | Export manifest stamp, Dashboard Trust Grade, Landing copy, IDE label | MVP |
| **🚩 V6.x** | **Verification MVP ship** | Full loop: create → verify → lock → export → IDE | **Ship gate** |
| **VF** | Fast-follow | Overlay, pattern.reference, satisfiability, drift→grade, reliability UI | Fast-follow |
| **v2 Phase 8** | Scale-up (unchanged) | HA, SSO, GitHub, SOC2 | Deferred |

Phases V1→V3 are backend-critical-path; V4/V6 frontend can parallelize once V2 exposes read API + V3 streams events.

---

## Phase V0 — Spec Delta & Contract Freeze

**Goal:** freeze the verification delta in shared contracts before code; zero ambiguity between PRD, architecture, API, and tests.

**What we're proving:** D7–D10 are mutually consistent; types compile; OpenAPI delta is valid; test IDs and gate scripts are defined before implementation starts.

### Deliverables
- Append **D7–D10** to `new_architecture.md §10.1` (single source; no duplicate spec files).
- Draft OpenAPI paths/schemas in `docs/04` under tag `Verification` (D9).
- Add `packages/shared/src/verification.ts` — types only (exported via `packages/shared/src/index.ts`).
- Add `packages/config` constants: default Trust Grade weights, `LOCK_GATE_CRITICALITY_THRESHOLD`, deterministic check IDs enum.
- UX rules 14–19 checklist appended to `docs/05 §8`.
- Root `package.json` gate script stubs (`gate:v1` … `gate:v3-ship`).

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| V0-UT-01 | `packages/shared` builds with D7 types | `tsc --noEmit` green in shared, api, web |
| V0-UT-02 | Import `VerificationRun` from api + web | No circular dependency; strict TS passes |
| V0-CT-01 | OpenAPI delta lint (`docs/04`) | Verification paths/schemas validate against OpenAPI 3.1 rules |
| V0-UT-03 | Config constants exported | `TRUST_GRADE_WEIGHTS`, `LOCK_GATE_CRITICALITY_THRESHOLD` importable |
| V0-DOC-01 | D7–D10 cross-reference PRD FR-2..FR-13 | Every FR maps to at least one delta item |

### Edge cases & failure scenarios
- 🔴 **V0-EC-01** D7 type drift vs PRD §11 model → CI doc-check or typed fixture test fails until aligned.
- 🔴 **V0-EC-02** OpenAPI lock 409 response missing conflict list shape → contract lint fails.
- 🟡 **V0-EC-03** Trust Grade weights sum produces score below 0 → config validation rejects at boot.
- 🟡 **V0-EC-04** Duplicate check ID in enum → build-time exhaustiveness test catches.
- 🟡 **V0-EC-05** SSE event union for verification collides with generation event names → naming convention enforced (`verification.*` prefix).
- ⚪ **V0-EC-06** Missing D10 UX rule in checklist → review gate blocks V0 sign-off.

### ✅ Test Gate
- [ ] D7 types compile in `packages/shared`; imported by api + web without circular deps.
- [ ] OpenAPI delta validates in CI (schema lint only — routes not implemented yet).
- [ ] Trust Grade default weights documented and validated in `packages/config`.
- [ ] Every PRD FR-2..FR-13 mapped to a phase + test ID prefix.
- [ ] UX rules 14–19 captured in `docs/05 §8` appendix.

**Re-run gate:** `pnpm --filter @architectai/shared build && pnpm --filter @architectai/config build`

**Dependencies:** v2.0 Phases 0–7 complete.

---

## Phase V1 — Verification Data Layer

**Goal:** persist verification runs, findings, and overrides under the same RLS guarantees as architectures.

**What we're proving:** verification data is tenant-isolated, schema-accurate, append-only where required, and round-trips through the service layer.

### Deliverables (backend)
- **Migration** `apps/api/src/db/migrations/000N_verification.sql` (forward-only):
  - `verification_runs`: `id`, `architecture_id`, `organization_id`, `version`, `status`, `trust_grade`, `engine_versions` (jsonb), `started_at`, `finished_at`.
  - `verification_findings`: `id`, `run_id`, `architecture_id`, `service_id`, `lineage_node_id`, `check`, `tier`, `verdict`, `confidence`, `ground_truth_source` (jsonb), `detail`, `evidence_ref`.
  - `verification_overrides`: `id`, `finding_id`, `architecture_id`, `user_id`, `reason`, `created_at` (immutable — no update/delete).
  - Unique partial index: one `running` run per `(architecture_id, version)`; idempotent re-verify returns existing run.
- **Drizzle schema** entries in `apps/api/src/db/schema.ts` — append only.
- **RLS policies** — copy pattern from `architectures` / `decision_lineage_*` (org isolation via `organization_id`).
- Extend `AuditEventType` in `packages/shared/src/types.ts`: `architecture.verified`, `architecture.override_recorded`.
- **`verification.service.ts`** (CRUD only in V1): create run, bulk insert findings, get latest run + findings, list overrides.

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| V1-IT-01 | Run migration on fresh PGlite + PG16 | All three tables, indexes, RLS policies created |
| V1-IT-02 | Create run + bulk insert findings | Rows persisted; FK to architecture valid |
| V1-IT-03 | Get latest run for architecture | Returns most recent by `started_at`; includes findings |
| V1-IT-04 | Insert override | Row created; linked to finding + user |
| V1-UT-01 | DTO mapper run → `VerificationRun` | All D7 fields present; dates ISO strings |
| V1-CT-01 | Audit enum includes new event types | TypeScript exhaustiveness on `AuditEventType` |

### Edge cases & failure scenarios
- 🔴 **V1-SEC-01 (RLS isolation)** Org A token reads org B verification run/findings/override → **404/empty**, never B's data.
- 🔴 **V1-SEC-02** Request without tenant context on verification tables → zero rows (RLS default-deny).
- 🔴 **V1-EC-01 (append-only overrides)** UPDATE or DELETE on `verification_overrides` → rejected or no-op; audit trail preserved.
- 🔴 **V1-EC-02** Finding references non-existent `run_id` or cross-org `architecture_id` → FK/RLS rejection.
- 🟡 **V1-EC-03** Two concurrent `running` runs for same `(architecture_id, version)` → partial unique index prevents duplicate; second insert fails cleanly.
- 🟡 **V1-EC-04** Bulk insert 500+ findings in one run → completes within transaction; no statement timeout in CI.
- 🟡 **V1-EC-05** `ground_truth_source` malformed JSON → Zod validation at service boundary → 400, not 500.
- 🟡 **V1-EC-06** Migration idempotency: re-run forward migration → no-op, no drift.
- 🟡 **V1-EC-07** Architecture archived/deleted → verification rows cascade or soft-block per policy; no orphan FK errors.
- ⚪ **V1-EC-08** Unicode in override `reason` → stored and retrieved correctly.

### ✅ Test Gate
- [ ] RLS isolation proven on all three verification tables (automated SEC suite).
- [ ] Types round-trip: DB → service → DTO matches D7.
- [ ] Override rows append-only.
- [ ] Partial unique index on running runs verified.
- [ ] **Re-run gate:** `pnpm gate:v1`

**Dependencies:** V0.

---

## Phase V2 — Tier-1 Verification Engine + Trust Grade v1

**Goal:** LLM-free deterministic adjudication in P95 < 2s; component + architecture rollup; Trust Grade (verification-only).

**What we're proving:** every MVP Tier-1 check produces correct verdicts on goldens; rollup logic is deterministic; Trust Grade math matches config; zero LLM calls on the hot path.

### Deliverables (backend — new module `apps/api/src/verification/`)

| File | Responsibility |
|---|---|
| `context.ts` | Load architecture detail, lineage graph, interrogation answers, active ruleset into a single `VerificationContext` |
| `checks/coverage.ts` | `coverage.requirement`, `coverage.justification` |
| `checks/structure.ts` | `structure.composition`, `structure.integrity` |
| `checks/governance.ts` | `governance.conformance` — calls into `engine/matchers` via architecture-graph adapter |
| `rollup.ts` | Per-finding → per-component → per-architecture verdict |
| `trust-grade.ts` | Score 100 − deductions; returns `TrustGradeBreakdown` (verification slice only in MVP) |
| `run-tier1.ts` | Orchestrator: runs all Tier-1 checks, returns findings + timing metadata |
| `architecture-graph.ts` | In-memory graph from `ArchitectureDetailDto` + lineage; adapter for matchers |

**Integration points (extend existing)**
- `lineage-read.service.ts` — add helper `loadRequirementGroundTruth(architectureId)` (read-only).
- `governance.service.ts` — expose `loadActiveRulesForArchitecture` if not already public.

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| V2-UT-01 | `coverage.requirement` golden (pass) | Every interrogation answer maps to ≥1 component → `verified` |
| V2-UT-02 | `coverage.requirement` golden (fail) | Orphan requirement → `conflict` with ground-truth ref |
| V2-UT-03 | `coverage.justification` golden (pass) | Every service traces to requirement → `verified` |
| V2-UT-04 | `coverage.justification` golden (fail) | "Invented" service with no requirement chain → `conflict` |
| V2-UT-05 | `structure.composition` golden (pass) | All contracts compose; interfaces present → `verified` |
| V2-UT-06 | `structure.composition` golden (fail) | Missing required interface → `conflict` |
| V2-UT-07 | `structure.integrity` golden (pass) | Acyclic connected graph → `verified` |
| V2-UT-08 | `structure.integrity` golden (fail) | Dependency cycle detected → `conflict` |
| V2-UT-09 | `governance.conformance` golden (pass) | Architecture satisfies all enabled rules → `verified` |
| V2-UT-10 | `governance.conformance` golden (fail) | Boundary violation on graph → `conflict` |
| V2-UT-11 | Rollup: mixed findings on one component | Deterministic `conflict` wins over `unverified` over `verified` |
| V2-UT-12 | Trust Grade: 2 conflicts + 1 probabilistic flag | Score = 100 − (2×conflict weight) − probabilistic cap; breakdown matches |
| V2-PERF-01 | Tier-1 on 20-service mock architecture | **P95 < 2s** in CI smoke |
| V2-UT-13 | Eval golden suite precision | **≥ 0.98** on Tier-1 pass/fail fixtures |

### Edge cases & failure scenarios
- 🔴 **V2-EC-01 (no LLM on Tier-1)** Spy on `LlmGateway` during `run-tier1` → **zero** calls.
- 🔴 **V2-EC-02 (false positive guard)** Seeded clean architecture must not produce deterministic `conflict` on any Tier-1 check (eval golden).
- 🔴 **V2-EC-03 (false negative guard)** Seeded faulty architectures (orphan service, cycle, uncovered requirement) → at least one deterministic `conflict`.
- 🔴 **V2-EC-04** Component with stripped/unresolved provenance ref → finding `unverified`, **never** silently `verified`.
- 🟡 **V2-EC-05** Architecture with zero services → all coverage checks degrade gracefully; no throw.
- 🟡 **V2-EC-06** Architecture with zero connections → structure checks pass or flag orphans explicitly.
- 🟡 **V2-EC-07** Empty ruleset → `governance.conformance` returns `verified` with explicit "no rules" detail, not skip.
- 🟡 **V2-EC-08** Disabled governance rule → not evaluated.
- 🟡 **V2-EC-09** Multiple conflicts on same component → single rolled-up `conflict`; all findings persisted.
- 🟡 **V2-EC-10** Trust Grade floor → score never below 0 after max deductions.
- 🟡 **V2-EC-11** Missing interrogation session (legacy arch) → coverage checks → `unverified` with clear detail, not crash.
- ⚪ **V2-EC-12** 50+ service architecture → Tier-1 still completes; perf logged even if over smoke threshold.

### ✅ Test Gate
- [ ] All six MVP Tier-1 checks implemented (excl. fast-follow checks).
- [ ] Eval golden precision **≥ 0.98** on Tier-1 suite (blocks merge on regression).
- [ ] Zero LLM calls on Tier-1 hot path.
- [ ] Rollup + Trust Grade unit tests green.
- [ ] **Re-run gate:** `pnpm gate:v2`

**Dependencies:** V1.

---

## Phase V3 — Orchestration, SSE, Lock Gate, Override

**Goal:** wire the engine into the product loop; make verification consequential.

**What we're proving:** verification auto-triggers after generation; streams over SSE; Lock is gated on deterministic conflicts; overrides are audited and unblock Lock; re-verify runs on version bump; idempotency holds.

### Deliverables (backend)

**Orchestration**
- `verification/runner.ts`: create run → Tier-1 → persist findings → compute Trust Grade → mark run `complete` → audit `architecture.verified`.
- **Auto-trigger:** extend `generation/runner.ts` — after successful `persistGenerationResult`, enqueue verification job.
- **Re-run on edit:** extend `architectures.service.ts` version bump path — enqueue verify for new version (FR-11).
- **Idempotency:** `POST /architectures/{id}/verify` returns existing run if `(architectureId, version)` already `complete` unless `?force=true` (role: architect+).

**Streaming**
- `verification/stream-hub.ts` — mirror `generation/stream-hub.ts` (Redis pub/sub + reconnect state).
- SSE route: `GET /api/architectures/{id}/verification/stream/{runId}` — events: `finding | progress | complete | error`.
- Extend `packages/shared` SSE union with `VerificationStreamEvent`.

**API routes** (append to `architectures.route.ts`)
- `POST /:architectureId/verify` → `202 { runId, streamUrl }`
- `GET /:architectureId/verification` → latest run + findings + Trust Grade + breakdown
- `GET /:architectureId/services/:serviceId/verification` → component findings
- `POST /:architectureId/findings/:findingId/override` `{ reason }` — roles: `architect`, `governance_lead`; min reason length 10 chars

**Lock gate (modify existing `lockArchitecture`)**
1. Require latest verification run for current `version` with `status = complete`.
2. Load unresolved deterministic `conflict` on components with `criticality ≥ threshold`.
3. Exclude findings with recorded override.
4. If any remain → `409 { code: "verification_gate_failed", conflicts: [...] }`.
5. On success → existing snapshot + `verificationRunId` in audit payload.

**Override service**
- `verification-override.service.ts`: validate, write override, audit `architecture.override_recorded`, recompute breakdown.

**Rate limits:** `verify` bucket 10/min/user.

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| V3-IT-01 | Generation `complete` → auto verify | Run created within 3s; status `running` → `complete` |
| V3-IT-02 | `POST /verify` manual trigger | `202 { runId, streamUrl }`; run persisted |
| V3-IT-03 | `GET /verification` | Latest run + all findings + Trust Grade + breakdown |
| V3-IT-04 | `GET /services/{id}/verification` | Component-scoped findings only |
| V3-IT-05 | Lock with all critical conflicts resolved | `200`; snapshot includes `verificationRunId` |
| V3-IT-06 | Lock after override on blocking conflict | `200`; override in audit |
| V3-IT-07 | SSE stream | `finding` events before `complete`; valid `VerificationStreamEvent` shape |
| V3-IT-08 | Version bump on edit | New verification run enqueued for new version |
| V3-IT-09 | Idempotent `POST /verify` on complete run | Returns existing runId (no duplicate) |
| V3-CT-01 | OpenAPI contract for all new routes + lock 409 | Validates against `docs/04` delta |

### Edge cases & failure scenarios
- 🔴 **V3-EC-01 (gate blocks lock)** Critical component with deterministic `conflict`, no override → Lock **409** with conflict list.
- 🔴 **V3-EC-02 (probabilistic never blocks)** Only probabilistic `unverified` on critical component → Lock **succeeds**.
- 🔴 **V3-EC-03 (no verify, no lock)** Lock without completed verification run for current version → **409** with clear code.
- 🔴 **V3-EC-04 (override audit)** Override writes `architecture.override_recorded`; immutable; appears in Trust Grade breakdown.
- 🔴 **V3-EC-05 (SSE reconnect)** Client drops mid-stream → reconnects via Last-Event-ID / hub state; no duplicate findings in UI.
- 🔴 **V3-SEC-01** `developer` role calls override → **403**; `architect`/`governance_lead` → **200**.
- 🟡 **V3-EC-06** Override with empty/short reason (< 10 chars) → **400**.
- 🟡 **V3-EC-07** Double override same finding → **409**.
- 🟡 **V3-EC-08** Override on non-conflict finding → **400** or **409** (policy: overrides only on conflicts).
- 🟡 **V3-EC-09** `POST /verify?force=true` on complete run | New run created; old findings superseded for version.
- 🟡 **V3-EC-10** Verification worker crash mid-run → run marked `failed` or retried; not stuck `running` forever.
- 🟡 **V3-EC-11** Generation fails lineage integrity → verification **not** triggered.
- 🟡 **V3-EC-12** Lock when status not `ready` → still blocked (v2.0 rule preserved) before gate check.
- 🟡 **V3-EC-13** Cross-replica SSE: worker on A, SSE consumer on B → Redis pub/sub delivers all events.
- 🟡 **V3-EC-14** Rate limit: 11th verify in window → **429** with `Retry-After`.
- 🟡 **V3-EC-15** Non-critical component conflict → Lock **succeeds** (warn only; surfaced in UI).
- ⚪ **V3-EC-16** Concurrent Lock requests → idempotent snapshot; no duplicate audit events.

### ✅ Test Gate
- [ ] FR-2, FR-8, FR-9, FR-11 satisfied end-to-end via API.
- [ ] Lock gate regression: existing phase-4 lock tests **updated** (not duplicated).
- [ ] SSE reconnect + cross-replica streaming verified.
- [ ] Override immutability + RBAC enforced.
- [ ] **Re-run gate:** `pnpm gate:v3`

**Dependencies:** V2.

---

## Phase V4 — Workspace & Generation UI (Spatial Trust)

**Goal:** users see *where* to trust the AI on the canvas and in the node panel; Lock gate modal in the web app.

**What we're proving:** verification is visually legible (rules 14–19); lineage stays above verification; canvas shows verdict colors; Lock modal handles gate failures; generation transitions into verify view.

### Deliverables (frontend — extend existing components)

| Existing file | Change |
|---|---|
| `hooks/useGenerationStream.ts` | On `complete`, transition to `verifying`; attach `useVerificationStream` |
| **New** `hooks/useVerificationStream.ts` | EventSource on verification stream; mirrors generation reconnect |
| `components/generation/GenerationExperience.tsx` | Verification Pass view after nodes; deterministic vs probabilistic distinction |
| `pages/GenerationPage.tsx` | Navigate to Workspace after Tier-1 complete |
| `components/workspace/ArchitectureCanvas.tsx` | Verdict border color primary; confidence tier secondary |
| `lib/canvas.ts` | Add `VERDICT_NODE_CLASS`; keep `TIER_NODE_CLASS` |
| `components/workspace/DecisionTracePanel.tsx` | Stack `VerificationFindingsSection` below lineage |
| **New** `components/workspace/VerificationFindingsSection.tsx` | Expandable findings with ground-truth, confidence, evidence |
| **New** `components/workspace/TrustGradeBadge.tsx` | Score + hover/expand breakdown (rule 18) |
| `pages/WorkspacePage.tsx` | Header Trust Grade; Lock CTA → gate modal |
| **New** `components/workspace/LockGateModal.tsx` | Blocking conflicts + override form |
| `components/workspace/LockArchitectureCta.tsx` | Open modal on 409 |
| `lib/api.ts` | Verification + override client methods |
| `stores/useWorkspaceStore.ts` | `verificationRunId`, `componentVerdicts` slice |

**UX rules enforced:** 14–19 from `new_PRD_updated.md §5`.

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| V4-E2E-01 | Full generate flow | After nodes, Verification Pass view appears; findings stream |
| V4-E2E-02 | Enter Workspace | Canvas nodes show verdict border colors (`data-verdict`) |
| V4-E2E-03 | Click node | Decision Trace (lineage) **above** Verification findings in panel |
| V4-E2E-04 | Expand finding | Shows check id, verdict, ground-truth source, confidence, evidence |
| V4-E2E-05 | Trust Grade badge | Visible in workspace header; hover shows breakdown |
| V4-E2E-06 | Clean architecture Lock | Lock succeeds without modal |
| V4-E2E-07 | Conflict → Lock → override → Lock | Modal shows conflicts; override form; second Lock succeeds |
| V4-UT-01 | `VERDICT_NODE_CLASS` mapping | `verified`/`unverified`/`conflict` → correct CSS classes |
| V4-E2E-08 | Generation reconnect during verify | Reconnecting badge; stream resumes |

### Edge cases & failure scenarios
- 🔴 **V4-EC-01 (rule 14)** Deterministic finding renders hard ✅/❌; probabilistic renders ~confidence + "signal, not proof" label — never identical styling.
- 🔴 **V4-EC-02 (rule 15)** Probabilistic finding never shown as blocking Lock; no red gate icon on advisory-only flags.
- 🔴 **V4-EC-03 (rule 16)** Ungrounded finding shows flagged state; never rendered as proven fact.
- 🔴 **V4-EC-04 (rule 17)** Override requires typed reason; success toast; cannot undo without re-edit flow.
- 🔴 **V4-EC-05 (rule 18)** Trust Grade never bare number — breakdown on hover/expand always available.
- 🔴 **V4-EC-06 (rule 19)** Conflicts use red ❌; amber reserved for unverified/uncertain only.
- 🔴 **V4-EC-07 (no tabs)** Right panel still driven by `selectedServiceId` only — verification section inside trace panel, **no new tabs**.
- 🟡 **V4-EC-08** Workspace opened before Tier-1 complete → skeleton/loading state for verdicts; no stale colors.
- 🟡 **V4-EC-09** Component with zero findings → panel section shows "verified" or explicit empty state.
- 🟡 **V4-EC-10** Very large architecture (20+ nodes) → canvas perf acceptable; verdict colors applied to all nodes.
- 🟡 **V4-EC-11** Lock API error (network) → modal/toast error; user can retry.
- 🟡 **V4-EC-12** Override API error → reason preserved in form; retry allowed.
- 🟡 **V4-EC-13** SSE disconnect on Generation page → reconnecting indicator; findings not duplicated.
- 🟡 **V4-EC-14** Focus mode → verdict colors preserved on canvas.
- ⚪ **V4-EC-15** Color-blind accessibility → verdict icon/badge in addition to border color on critical/conflict nodes.

### ✅ Test Gate
- [ ] FR-6 satisfied; FR-7 deferred to VF.
- [ ] UX rules 14–19 verified in Playwright checklist.
- [ ] No new screens; no right-panel tabs.
- [ ] Lineage panel order preserved (why above whether).
- [ ] **Re-run gate:** `pnpm gate:v4`

**Dependencies:** V3 (SSE + read API).

---

## Phase V5 — Tier-2 Cross-Model Adjudication

**Goal:** independent second opinion streamed asynchronously; never gates Lock.

**What we're proving:** cross-model runs on a different provider; streams after Tier-1; advisory only; full pass within latency budget.

### Deliverables (backend)
- `verification/checks/adjudication-crossmodel.ts` + `run-tier2.ts`
- `apps/api/src/ai/prompts/verification-adjudication.ts` — Zod schema: agree | disagree | would_choose + rationale
- Extend `LlmGateway`: workload `verification-adjudication`; generation provider ≠ verification provider
- Worker enqueues Tier-2 after Tier-1 complete; streams `finding` events

**Deliverables (frontend)**
- `VerificationFindingsSection`: probabilistic styling; optional "Show advisory signals" toggle

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| V5-UT-01 | Gateway routing | `verification-adjudication` uses provider ≠ generation provider |
| V5-IT-01 | Tier-2 after Tier-1 | `complete` (Tier-1) emitted before first cross-model `finding` |
| V5-IT-02 | Agree response | Finding `unverified` or neutral advisory; not `verified` (probabilistic never proves) |
| V5-IT-03 | Disagree response | Finding `unverified` with cross-model detail |
| V5-IT-04 | Lock after Tier-1 only | Lock succeeds before Tier-2 finishes |
| V5-PERF-01 | Full pass (Tier-1 + Tier-2) | **P95 < 20s** on mock provider in CI |
| V5-E2E-01 | UI shows advisory finding | Distinct styling; "signal, not proof" visible |

### Edge cases & failure scenarios
- 🔴 **V5-EC-01 (independence)** CI assertion: generation and verification provider names differ when both configured.
- 🔴 **V5-EC-02 (never gates)** Cross-model `disagree` on critical component → Lock still succeeds (Tier-1 clean).
- 🔴 **V5-EC-03 (no LLM on Tier-1)** Tier-1 path still zero LLM after V5 lands.
- 🟡 **V5-EC-04** LLM timeout on cross-model → finding `unverified` with degraded detail; run still completes.
- 🟡 **V5-EC-05** LLM returns invalid JSON → bounded retry; then skip service with logged degradation.
- 🟡 **V5-EC-06** Cross-model for architecture with 20 services → batched; full pass within budget.
- 🟡 **V5-EC-07** Token budget exceeded mid-Tier-2 → remaining services skipped; partial findings persisted.
- 🟡 **V5-EC-08** User toggles off advisory signals → probabilistic findings hidden; deterministic unchanged.
- ⚪ **V5-EC-09** Cross-model agrees on everything → all advisory; none styled as proven ✅.

### ✅ Test Gate
- [ ] FR-4 satisfied.
- [ ] Independence rule enforced in CI.
- [ ] Full pass P95 < 20s (mock).
- [ ] Lock never blocked by Tier-2 alone.
- [ ] **Re-run gate:** `pnpm gate:v5`

**Dependencies:** V3 (streaming infrastructure).

---

## Phase V6 — Export, Dashboard, IDE Copy, Landing

**Goal:** verification stamp propagates through the bridge; Trust Grade visible on return hub.

**What we're proving:** export requires verification; manifest stamped correctly; dashboard shows Trust Grade; IDE label updated; v2.0 loop regression green.

### Deliverables (backend — extend existing)
- `export/build-artifacts.ts`: manifest + `verificationRunId`, `trustGrade`, `trustGradeBreakdown`, `overrides[]`
- `export.service.ts`: pre-export verification check (FR-10)
- `architectures.service.ts` `toSummary`: `trustGrade`, `verificationStatus`
- `getLockedVersionSnapshot`: include `verificationRunId`

**Deliverables (frontend — extend existing)**
- `ExportWizardPage.tsx`: verification stamp on manifest preview
- `ArchitectureCard.tsx` + `TopArchCard.tsx`: Trust Grade badge + tooltip
- `LandingHero.tsx`: copy repositioning to "independent verification"

**Deliverables (extension — extend existing)**
- `cursor-extension/src/panels/html.ts`: "Verified baseline · governed" when manifest has `verificationRunId`

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| V6-IT-01 | Export with completed verification | `200`; manifest includes run id + Trust Grade |
| V6-IT-02 | Export without verification | **409** with clear error code |
| V6-IT-03 | Manifest override array | Matches recorded overrides for locked version |
| V6-IT-04 | Dashboard list API | `trustGrade` + `verificationStatus` on summary |
| V6-CT-01 | Manifest schema vs `CursorConfig` | New fields validate; backward-compatible readers ignore |
| V6-E2E-01 | Full loop Playwright | create → verify → lock → export → manifest shows stamp |
| V6-E2E-02 | Dashboard card | Trust Grade visible; breakdown on hover |
| V6-E2E-03 | Extension Normal panel | "Verified baseline · governed" when stamped manifest pulled |
| V6-REG-01 | `pnpm gate:phase7` | Full v2.0 IDE loop still green |
| V6-REG-02 | `pnpm gate:phase4` | Lock + workspace regression green |

### Edge cases & failure scenarios
- 🔴 **V6-EC-01** Export with stale verification (old version run, not current locked version) → **409**.
- 🔴 **V6-EC-02** Manifest `verificationRunId` matches locked version's run, not latest draft verify.
- 🔴 **V6-EC-03** Extension pulls manifest without `verificationRunId` (pre-v3 export) → falls back to "Governed" label only.
- 🟡 **V6-EC-04** Export concurrent with in-progress verification → blocked or waits; no partial manifest.
- 🟡 **V6-EC-05** Trust Grade breakdown JSON large → manifest size within limits; extension parses OK.
- 🟡 **V6-EC-06** Dashboard architecture with no verification yet → card shows "pending" or prompts verify.
- 🟡 **V6-EC-07** Re-export after override → manifest `overrides[]` updated.
- 🟡 **V6-EC-08** Landing copy A/B — verification headline present; no "30-second generation" as primary hook.
- ⚪ **V6-EC-09** TopArchCard vs MyProjectCard both show Trust Grade consistently.

### ✅ Test Gate
- [ ] FR-10, FR-12 (dashboard) satisfied.
- [ ] v2.0 gates `gate:phase4` through `gate:phase7` still green.
- [ ] Manifest stamp integrity (locked version + run id).
- [ ] Extension label fallback for legacy manifests.
- [ ] **Re-run gate:** `pnpm gate:v6`

**Dependencies:** V3 (gate + run id), V4 (Trust Grade UI components).

---

## 🚩 Phase V6.x — Verification MVP Ship Gate

**Goal:** the **verification-gated loop** live for external users on lean hosting.

**What we're proving:** production deploy succeeds; latency budgets hold; full loop completable by external users; instrumentation live; combined regression gate green.

### Ship checklist
- Deploy api + worker with verification processor enabled.
- `VERIFICATION_ENABLED=true` default on in prod (optional flag).
- Instrument: verification coverage, gate block rate, override rate, trust-legibility (≥1 finding opened).
- Update README status section to v3.0.

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| V6x-E2E-01 | Prod smoke: full loop | Signup → interrogate → generate → verify → lock → export → IDE connect |
| V6x-PERF-01 | Prod Tier-1 latency | P95 < 2s |
| V6x-PERF-02 | Prod full pass latency | P95 < 20s |
| V6x-REG-01 | `pnpm gate:v3-ship` | All v3 gates + `gate:phase7` green in CI |
| V6x-OBS-01 | Sentry + analytics | Verification events visible; no unhandled 409 storms |

### Edge cases & failure scenarios
- 🔴 **V6x-EC-01** Verification worker down → generation still completes; verify fails gracefully with retry CTA; Lock blocked with clear message.
- 🔴 **V6x-EC-02** Redis down → SSE degrades; GET /verification poll fallback works.
- 🟡 **V6x-EC-03** Feature flag off → v2.0 lock behavior restored; no partial v3 UI without backend.
- 🟡 **V6x-EC-04** LLM cost spike from cross-model → per-org budget blocks Tier-2 only; Tier-1 + Lock still work.
- ⚪ **V6x-EC-05** First-user empty dashboard → Landing copy + create flow mention verification.

### ✅ Test Gate (ship)
- [ ] External user completes create → verify → lock → export → IDE in prod.
- [ ] Tier-1 P95 < 2s and full pass P95 < 20s in prod smoke.
- [ ] `pnpm gate:v3-ship` green in CI.
- [ ] Qualitative validation (PRD §14): architects report trust legibility.
- [ ] v2.0 loop completion rate tracked alongside new verify→lock rate.

**Re-run gate:** `pnpm gate:v3-ship`

**Fast-follow immediately after ship:** VF phases.

---

## Phase VF — Fast-Follow (Post-MVP)

**Goal:** complete PRD fast-follow tier: overlay, reference patterns, satisfiability, drift→grade, reliability UI.

**What we're proving:** remaining FR-7, FR-13, drift slice of FR-12; no regression to MVP gates.

### Deliverables
| Item | Work | Touch |
|---|---|---|
| `constraint.satisfiability` | Seed `capability_reference` table; Tier-1 check | `verification/checks/constraint.ts` + migration D12 |
| `pattern.reference` | `reference_patterns` pgvector + RAG query | D11 migration; reuse RAG infra |
| Lineage Graph verification overlay | Ground-truth nodes + `verifies`/`contradicts` edges | `LineageGraphView.tsx`, `LineageGraphStage.tsx` |
| Drift → Trust Grade live aggregation | Open drift penalties in breakdown | `trust-grade.ts` + dashboard poll |
| Verifier reliability UI | Per-check precision from CI eval | Workspace info affordance (FR-13) |
| Optional ranked list view | Alongside spatial projection | `VerificationFindingsSection` toggle (open Q #6) |

### Happy-path tests
| ID | Test | Expected |
|---|---|---|
| VF-UT-01 | `constraint.satisfiability` pass/fail goldens | Correct verdict against capability table |
| VF-UT-02 | `pattern.reference` golden | Nearest pattern + similarity; advisory `unverified` |
| VF-E2E-01 | Lineage overlay toggle | Ground-truth nodes + typed edges visible |
| VF-E2E-02 | Trust Grade with drift | Breakdown shows verification + drift deductions |
| VF-E2E-03 | Reliability info affordance | Per-check precision displayed |
| VF-IT-01 | Drift score change updates Trust Grade | Dashboard reflects within poll interval |

### Edge cases & failure scenarios
- 🔴 **VF-EC-01** Empty reference corpus → `pattern.reference` returns `unverified` with "no corpus," not crash.
- 🔴 **VF-EC-02** Overlay off by default → no perf regression on Lineage Graph.
- 🟡 **VF-EC-03** Constraint table miss → satisfiability `unverified`, not false `conflict`.
- 🟡 **VF-EC-04** Drift resolved → Trust Grade drift deduction removed on next poll.
- 🟡 **VF-EC-05** Reliability metrics stale → UI shows last CI run date.
- ⚪ **VF-EC-06** Ranked list + spatial both enabled → consistent verdict ordering.

### ✅ Test Gate
- [ ] FR-7, FR-13 complete.
- [ ] Drift→grade slice of FR-12 complete.
- [ ] `pnpm gate:vf` green.
- [ ] `pnpm gate:v3-ship` regression still green.

**Dependencies:** V6.x ship.

---

## 6. File Touch Map (Extend vs New)

### New files (subsystem boundary only)

```
apps/api/src/verification/
  context.ts, architecture-graph.ts, run-tier1.ts, run-tier2.ts, rollup.ts,
  trust-grade.ts, runner.ts, stream-hub.ts
  checks/coverage.ts, structure.ts, governance.ts, adjudication-crossmodel.ts
  checks/constraint.ts                                    # VF

apps/api/src/services/verification.service.ts
apps/api/src/services/verification-override.service.ts

packages/shared/src/verification.ts

apps/web/src/hooks/useVerificationStream.ts
apps/web/src/components/workspace/VerificationFindingsSection.tsx
apps/web/src/components/workspace/TrustGradeBadge.tsx
apps/web/src/components/workspace/LockGateModal.tsx

apps/api/src/ai/prompts/verification-adjudication.ts
apps/api/test/verification/                             # goldens + fixtures
apps/api/test/api/phase-v*.test.ts
apps/web/e2e/verification-*.spec.ts
```

### Extend only (do not duplicate)

| File | Extension |
|---|---|
| `apps/api/src/db/schema.ts` | +3 tables (+2 VF) |
| `apps/api/src/generation/runner.ts` | post-complete verify enqueue |
| `apps/api/src/services/architectures.service.ts` | gate lock; re-verify on version bump |
| `apps/api/src/routes/architectures.route.ts` | +verify routes |
| `apps/api/src/export/build-artifacts.ts` | manifest fields |
| `apps/api/src/services/export.service.ts` | pre-export verification check |
| `apps/api/src/ai/gateway.ts` | verification workload route |
| `docs/04_ARCHITECTAI_API_SPEC.yaml` | D9 paths |
| `apps/web/src/components/workspace/ArchitectureCanvas.tsx` | verdict colors |
| `apps/web/src/components/workspace/DecisionTracePanel.tsx` | stack verification |
| `apps/web/src/components/generation/GenerationExperience.tsx` | verify pass view |
| `apps/cursor-extension/src/panels/html.ts` | label copy |
| `package.json` (root) | `gate:v1`…`gate:v6`, `gate:v3-ship`, `gate:vf` |

---

## 7. Combined Test Gates

Add to root `package.json`:

```json
"gate:v1": "pnpm --filter @architectai/shared build && pnpm --filter @architectai/api exec vitest run test/api/phase-v1.verification-schema.test.ts",
"gate:v2": "pnpm gate:v1 && pnpm --filter @architectai/api exec vitest run test/verification/",
"gate:v3": "pnpm gate:v2 && pnpm --filter @architectai/api exec vitest run test/api/phase-v3.verification-orchestration.test.ts",
"gate:v4": "pnpm gate:v3 && pnpm --filter @architectai/web typecheck && pnpm --filter @architectai/web exec playwright test e2e/verification-workspace.spec.ts",
"gate:v5": "pnpm gate:v4 && pnpm --filter @architectai/api exec vitest run test/api/phase-v5.crossmodel.test.ts",
"gate:v6": "pnpm gate:v5 && pnpm --filter @architectai/web exec playwright test e2e/verification-export.spec.ts",
"gate:v3-ship": "pnpm gate:v6 && pnpm gate:phase7",
"gate:vf": "pnpm gate:v3-ship && pnpm --filter @architectai/api exec vitest run test/api/phase-vf.verification-fastfollow.test.ts && pnpm --filter @architectai/web exec playwright test e2e/verification-overlay.spec.ts"
```

**Regression rule:** every v3 gate includes prior v3 gates + v2.0 `gate:phase7` at ship. Update existing v2 lock/export E2E tests in place — do not duplicate spec files.

---

## 8. Cross-Phase Regression Matrix

Tests that must stay green after each v3 phase lands:

| v3 Phase | Required v2 regression gates |
|---|---|
| V1 | `gate:phase1` (RLS baseline) |
| V2 | `gate:phase3` (lineage intact) |
| V3 | `gate:phase4` (lock — update tests for 409 gate) |
| V4 | `gate:phase4` E2E (workspace UX rules 1–13) |
| V5 | `gate:phase3`, `gate:phase5` (generation + drift unchanged) |
| V6 | `gate:phase6`, `gate:phase7` (export + IDE loop) |
| V6.x | All v3 gates + full v2 loop |
| VF | `gate:v3-ship` |

---

## 9. Non-Functional Targets (v3.0 additive)

| Metric | Target | Phase | Test ID |
|---|---|---|---|
| Tier-1 deterministic verdict | P95 < 2s | V2 | V2-PERF-01 |
| Full verification pass | P95 < 20s streamed | V5 | V5-PERF-01 |
| Verifier precision (Tier-1) | ≥ 0.98 | V2 | V2-UT-13 |
| Lock gate evaluation | < 100ms | V3 | V3-IT-05 (timed) |
| Generation | P95 < 30s | — | P3-PERF-01 (unchanged) |
| Drift check | P95 < 200ms | — | P5-PERF-01 (unchanged) |

---

## 10. Critical-Path Dependencies

```
V0 (contracts)
 └─► V1 (schema)
      └─► V2 (Tier-1 engine + Trust Grade)
           └─► V3 (orchestration + gate + SSE)
                ├─► V4 (workspace/gen UI)  ──┐
                ├─► V5 (cross-model)         ──┼─► V6 (export/dashboard/IDE)
                └──────────────────────────────┘
                                              └─► V6.x (ship)
                                                   └─► VF (fast-follow)
```

---

## 11. Parallel Team Tracks

| Track | Phases | Notes |
|---|---|---|
| **A — Backend / Platform** | V0 → V1 → V2 → V3 → V5 | Owns engine, gate, streaming |
| **B — Frontend / Web** | V0 (types) → V4 → V6 | Mock API from V2; E2E from V3 |
| **C — AI / Eval** | V2 goldens → V5 cross-model | Owns independence + precision gates |
| **D — Extension** | V6 copy only | Regression via `gate:phase7` |

---

## 12. Open Questions (resolve during build)

| # | Question | Default | Resolve by | Test impact |
|---|---|---|---|---|
| 1 | Trust Grade weighting | conflicts −25, unverified-critical −10, probabilistic −3 (cap −15) | V2 | V2-UT-12 |
| 2 | Criticality threshold for gate | `confidenceTier === "critical"` OR `hasCriticalIssue` | V3 | V3-EC-01, V3-EC-15 |
| 3 | Cross-model family | `LLM_MODEL_VERIFICATION` env | V5 | V5-UT-01 |
| 4 | Reference corpus seeding | Defer VF | VF | VF-EC-01 |
| 5 | Non-overridable conflict classes | All overridable MVP; `governance_lead` for governance conflicts | V3 | V3-SEC-01 |
| 6 | Spatial vs list UX | Spatial MVP; ranked list VF toggle | V4/VF | VF-EC-06 |

---

## 13. Risks & Mitigations

| Risk | Mitigation | Test |
|---|---|---|
| Duplicating engine matchers | Single `engine/matchers`; graph adapter only | V2-EC-01 |
| Duplicating SSE infrastructure | Mirror generation hub; separate channel prefix | V3-EC-05 |
| Lock regression breaks export loop | Update phase-4 tests in place | V6-REG-02 |
| False positives erode trust | ≥0.98 precision gate | V2-UT-13 |
| Probabilistic mistaken for proof | Rules 14–15 E2E | V4-EC-01..02 |
| Scope creep into VF | VF post-V6.x only | Ship gate scope check |

---

## 14. Relationship to v2.0 Documents

| Document | Action |
|---|---|
| `IMPLEMENTATION_PLAN.md` | **Frozen** at Phase 7 ✅ |
| `TEST_PLAN.md` | **Frozen** for v2.0; v3 tests live in **this document** |
| `new_PRD_updated.md` | Authoritative product framing |
| `new_architecture.md` | Append D7–D12 in V0 |
| `README.md` | Update at V6.x ship |

---

## 15. Definition of Done — Verification MVP (V6.x)

1. **Loop:** sign in → interrogate → generate → auto verify → inspect verdicts → gated lock (or override) → export stamped manifest → IDE verified baseline → drift works.
2. **Independence:** generation model ≠ verification model (V5-UT-01, V5-EC-01).
3. **Latency:** Tier-1 P95 < 2s; full pass P95 < 20s.
4. **Precision:** Tier-1 eval goldens ≥ 0.98.
5. **Security:** RLS on verification tables; override RBAC; immutable audit.
6. **Regression:** v2.0 `gate:phase2`–`gate:phase7` green.
7. **UX:** rules 14–19 Playwright checklist green.
8. **No duplication:** no forked engine, generation, lock, or export modules.

---

*This plan is additive to `IMPLEMENTATION_PLAN.md` v2.0. Each phase ships with tests; no phase advances until its Test Gate is green.*
