# ArchitectAI — Phase-Wise Implementation Plan

**Version:** 2.0
**Date:** 2026-05-29
**Companion:** `new_PRD.md` (product) · `new_architecture.md` (system design) · `TEST_PLAN.md` (per-phase test cases & gates) · `docs/01–05` (specs)

> **Goal:** ship a **lean, production-grade MVP that delivers the entire governance loop** — *create & lock (Web) → export/hand-off (Web→IDE) → govern & drift-detect (Cursor/VS Code) → monitor (Web Dashboard)* — at near-zero fixed infra cost (we pay LLM usage + small SaaS free tiers). Quality is preserved; only operational scale (HA, multi-region, SSO/SAML, premium APM, GitHub integration, SOC2 certification) is deferred to the **scale-up** track.

> **v2.0 change.** The MVP is now the **full loop** (all 9 screens + the Cursor extension), per the corrected product model in `new_PRD.md`. The 🚩 **Public Feedback MVP** ships at the **end of Phase 7** (the first point the loop is complete). Earlier internal checkpoints validate sub-flows.

### Confirmed decisions baked into this plan
- **MVP = full loop** (Web + Export + Cursor extension + Dashboard).
- **"Locked" reuses `status='ready'`** (no new lifecycle state); export requires `ready`; Lock snapshots `version`.
- **Web→IDE hand-off = deep-link** opens IDE; extension **pulls config via scoped workspace token** (downloadable `.architectai/` fallback).
- **Local workspace path** at MVP (GitHub deferred).
- **Auth required upfront**; **Dashboard is home if user has projects**.
- **Drift→Dashboard live sync = fast-follow** (drift works in the IDE at MVP; persisted server-side).
- **Post-lock edits are versioned**; re-export emits `architecture.updated`.
- **Decision Lineage (Provenance Engine) is a flagship MVP capability** — captured at generation time, top-priority panel on node click, plus a full lineage graph (spec deltas **D3–D6** in `new_architecture.md §10.1`).

### Ready to build (definition of ready)
The three documents are finalized and mutually consistent. Before writing Phase 0 code, the only prerequisite is provisioning the external accounts + env vars in `new_architecture.md §12.4`. Source-of-truth precedence when a detail is ambiguous: `docs/01–05` for screen/data/API specifics, overridden only by the **spec deltas D1–D6** (`new_architecture.md §10.1`) and the confirmed decisions above.

**Phase 2 gate (2026-05-29):** All `TEST_PLAN.md` Phase 2 happy paths, 🔴 edge cases, and the Test Gate checklist are green (`pnpm gate:phase2`).

**Phase 3 gate (2026-05-29):** All `TEST_PLAN.md` Phase 3 happy paths, 🔴 edge cases, and the Test Gate checklist are green (`pnpm gate:phase3`).

**Phase 4 gate (2026-05-29):** All `TEST_PLAN.md` Phase 4 happy paths, 🔴 edge cases, and the Test Gate checklist are green (`pnpm gate:phase4`).

**Phase 5 gate (2026-05-29):** All `TEST_PLAN.md` Phase 5 happy paths, 🔴 edge cases, and the Test Gate checklist are green (`pnpm gate:phase5`).

**Phase 6 gate (2026-05-29):** All `TEST_PLAN.md` Phase 6 happy paths, 🔴 edge cases, and the Test Gate checklist are green (`pnpm gate:phase6`).

**Phase 7 gate (2026-05-29):** All `TEST_PLAN.md` Phase 7 happy paths, 🔴 edge cases, and the Test Gate checklist are green (`pnpm gate:phase7`). **Next action: Phase 7.x — Public Feedback MVP (ship gate).**

---

## Delivery Map

| Phase | Theme | Outcome | Tier |
|---|---|---|---|
| **0** | Foundations & scaffolding | Monorepo, CI, shared types, lean hosting, local stack | MVP |
| **1** | Data & API skeleton | DB live (RLS), **auth-upfront**, OpenAPI-validated endpoints | MVP |
| **2** ✅ | Create A | Landing (auth-gated) → Interrogation — **gate closed** (`pnpm gate:phase2`) | MVP |
| **3** ✅ | Create B | Generation (SSE + worker + lineage) — **gate closed** (`pnpm gate:phase3`) | MVP |
| **4** ✅ | Workspace + **Lock** + **Decision Lineage** | Canvas, **Decision Trace mode** (primary on node click) + Lineage Graph, Lock → version snapshot — **gate closed** (`pnpm gate:phase4`) | MVP |
| **5** | Governance & drift engine | Deterministic engine (<200ms), drift lifecycle, exceptions, audit | MVP |
| **6** | Bridge: Export + Dashboard | Export Wizard, `.architectai/*` builder, workspace token + config pull, Dashboard | MVP |
| **7** | Cursor extension | Deep-link connect, Setup/Normal/Drift, WS enrichment + `architecture.updated` | MVP |
| **🚩 7.x** | **Public Feedback MVP** | **Full loop live for users on lean hosting** | **MVP ship** |
| **8** | Scale-up & compliance | HA, multi-region, SSO/SAML, GitHub App, premium APM, SOC2 cert | Scale-up |

> Phases are sequenced by dependency. Frontend and backend tracks run in parallel against the shared OpenAPI contract. The two highest-leverage components — the **shared contract** and the **deterministic drift engine** — start early.

---

## Phase 0 — Foundations & Scaffolding

**Goal:** reproducible monorepo; lean hosting provisioned; local stack boots.

**Deliverables**
- pnpm + Turborepo: `apps/web`, `apps/api`, `apps/cursor-extension`, `packages/shared`, `packages/config`, `infra/`.
- `packages/shared`: canonical types from `docs/02`.
- TS strict configs, ESLint/Prettier, Husky + lint-staged + commitlint.
- GitHub Actions CI: install → lint → typecheck → test → build.
- `docker-compose.yml`: Postgres 16 + Redis 7 for local dev.
- **Lean hosting accounts** (free/cheap): Neon/Supabase, Upstash, Render/Fly, Clerk, Sentry, Resend (per `new_architecture.md §12.2`).
- Tailwind tokens (`docs/05 §1`), `globals.css` keyframes, Inter + JetBrains Mono; pino + OTel bootstrap.

**Exit criteria:** `pnpm build` green across workspaces; `docker compose up` + API `/healthz` ok locally; CI green.

**Dependencies:** none.

---

## Phase 1 — Data Layer & API Skeleton (auth-upfront)

**Goal:** multi-tenant DB with RLS and an authenticated, contract-validated API.

**Deliverables**
- **Drizzle schema** mirroring `docs/03` exactly (enums, tables, FKs, indexes, partitioned `audit_events`, triggers) on **Neon/Supabase** (pgvector + pg_trgm). Forward-only migrations.
- **Decision Lineage tables** (spec delta **D4**): `decision_lineage_nodes`, `decision_lineage_edges`, `decision_traces` — architecture-scoped, under the same RLS policy. Shared **D3** lineage types added to `packages/shared`.
- RLS policies + `tenantContext` middleware (`SET LOCAL` org/user per request inside a txn).
- **Clerk** integration: **auth required upfront**; JWT verify middleware; user/org provisioning webhook; post-auth routing helper (**Dashboard if projects exist**, else Landing/empty-state).
- `express-openapi-validator` wired to `docs/04`; central `errorHandler` → `ApiError`.
- Redis **rate limiter** (generate 10/min, drift 120/min, default 300/min).
- Architectures CRUD (incl. `pg_trgm` search + pagination); Governance rulesets list/create + **seed default ruleset** (`docs/03`); Audit write helper + `GET /audit` (role-gated).
- BullMQ wired (empty processors). Supertest + Postgres test container; **fail-closed RLS isolation tests**.

**Exit criteria:** endpoints conform to OpenAPI (contract tests green); RLS proven (org A can't read org B); rate limits tested.

**Dependencies:** Phase 0.

---

## Phase 2 — Create A: Landing (auth-gated) + Interrogation

**Goal:** an authenticated user can paste a requirement and complete the ≤7-question interrogation, autosaved.

**Deliverables (backend)**
- **LLM Gateway v1** (provider-agnostic, streaming, `generateStructured` + Zod, retries, cost metering, prompt registry).
- Interrogation service: `start`, `answer`, `skip`, `edit` — adaptive questions (Sonnet-class), progress scoring; persist sessions/questions; autosave; audit.

**Deliverables (frontend)**
- **Landing** (Screen 1): public marketing + hero; **hero CTA requires sign-in** (auth-upfront); import chips, example pills, 20-char validation, `⌘↵` as `<kbd>`.
- **Interrogation** (Screen 2): answered rows w/ hover-edit, 2×2 option cards (`1–4` kbd + Enter), freeform override, locked previews, footer step dots, Autosaved badge, dual progress bars.
- `useSessionStore` + `useInterrogation`; keyboard shortcuts.

**Exit criteria (all green — 2026-05-29):**
- [x] End-to-end interrogation (min 3 / max 7); session `complete` at max
- [x] Edits preserve later answers (P2-EC-02)
- [x] Auth-upfront + Playwright E2E (P2-E2E-01, P2-EC-01, P2-EC-10)
- [x] LLM retry + fallback question (P2-EC-04)
- [x] Interrogation eval goldens (P2-UT-01)
- [x] Locked previews, Generate CTA gating, `GET /interrogate/:sessionId` in OpenAPI

**Re-run gate:** `pnpm gate:phase2`

**Dependencies:** Phase 1.

---

## Phase 3 — Create B: Generation (SSE)

**Goal:** a completed session generates a governed architecture, streamed, < 30s P95.

**Deliverables (backend)**
- `POST /generate/start` → `architecture(draft)` + enqueue → `202 {architectureId, streamUrl}`.
- **Generation worker**: RAG context (pgvector) + **interrogation answers + PRD spans + active ruleset** → `gateway.stream(generation)` (Opus-class) → Zod-validated `node|governance|lineage|progress|complete` → persist services/layers/connections/issues/scores **+ lineage nodes/edges/traces**.
- **Provenance capture (D6)**: for each component the model emits a `DecisionTrace` + contributing lineage nodes/edges; the worker runs a **referential-integrity check** (every `source.ref` must resolve to a real requirement/PRD-span/rule — no fabricated provenance) before persisting; `lineage` SSE events stream alongside `node` events.
- **SSE** `GET /generate/stream/{id}` bridged via **Redis pub/sub** (cross-replica + reconnect via `gen:state`).
- `POST /generate/{id}/cancel` → revert to `draft` + terminal event.

**Deliverables (frontend)**
- **Generation** (Screen 3): `useGenerationStream` (EventSource), node stream, governance checklist, live scores, progress + `~Ns`, **always-available Cancel** w/ confirm, "Return to add context", complete CTA → Workspace.

**Exit criteria (all green — 2026-05-29):**
- [x] `POST /generate/start` → `202` + SSE stream (`node|governance|lineage|progress|complete`)
- [x] Referential-integrity gate + trace completeness (P3-EC-01/02)
- [x] Reconnect via `Last-Event-ID` + shared hub / Redis pub/sub (P3-EC-03/04)
- [x] Cancel + worker-crash recovery (P3-IT-04, P3-EC-12)
- [x] Mock perf smoke P95 &lt; 30s (P3-PERF-01)
- [x] Generation screen (P3-E2E-01)

**Re-run gate:** `pnpm gate:phase3`

**Dependencies:** Phase 2 + Gateway + Redis. *(Internal checkpoint: Landing→Workspace visible end-to-end after Phase 4.)*

**Deferred to scale-up / Phase 3.x:** pgvector RAG context, Anthropic Opus streaming adapter, k6 load test at production scale.

---

## Phase 4 — Architecture Workspace + Decision Lineage + Lock

**Goal:** the command center (Screen 4) with the **flagship Decision Lineage** front-and-center; user inspects causal provenance, refines, and **Locks** for export.

**Deliverables (frontend)**
- **React Flow canvas**: absolute nodes (140×72), blast-radius bezier edges, status borders/opacity, selection ring, layer legend, grid.
- **Focus Mode** (header + toolbar); **48px icon toolbar** (no sidebar) + a **Lineage Graph toggle**.
- **Decision Trace mode (flagship, top priority):** clicking any node makes the **Decision Lineage** the *primary* right-panel content — an ordered, **expandable causal chain** (Requirement → Constraint → Selected Pattern → Rejected Alternatives → Governance Rules → Contracts → Downstream Implications) + Assumptions + Evidence; each step expands to its `source` (interrogation answer / PRD span / rule / metric) + confidence. Status banner + confidence stay compact above; **issues, metadata, "Implement a change" demoted below the trace**.
- **Architecture Lineage Graph view**: full typed graph (React Flow), color-coded by node type, edges labeled by `rationale`; selecting a graph node focuses its trace.
- **AI Reasoning panel (no selection):** keep the **actionable urgency triage**; **replace the old per-layer prose narration** with lineage entry points + the Lineage Graph toggle. "Ask the architecture" `⌘L` RAG + Export remain.
- **Bottom status bar**; `useWorkspaceStore` per `docs/05 §4` (extend with `lineageGraphOpen`; panel mode still driven by `selectedServiceId`, no tabs).
- **Lock action**: finalizes by taking a **`version` snapshot** (export baseline) + audit event. Generation already set `status = ready`; export requires `ready` and uses the latest locked version. (Lock chooses *which version* is exported — not a separate gate/state.)

**Deliverables (backend)**
- `GET /architectures/{id}` full detail; **`GET /architectures/{id}/lineage`** (full graph) + **`GET /architectures/{id}/services/{serviceId}/trace`** (resolved trace) — spec delta **D5**; Lock endpoint (version snapshot + audit); "Ask the architecture" chat (RAG, Sonnet-class) **grounded in the lineage**.

**Exit criteria:** node click opens Decision Trace as the primary panel (no tabs); causal chain expands to evidence; Lineage Graph renders + cross-navigates; old prose narration removed; only referentially-valid trace nodes shown; Lock snapshots an exportable version; `docs/05 §8` rules verified (checklist + Playwright).

**Dependencies:** Phase 3 (lineage captured during generation).

---

## Phase 5 — Governance & Drift Engine

**Goal:** deterministic governance evaluation + full drift lifecycle (the latency-critical core).

**Deliverables**
- **Engine** (`apps/api/src/engine`): AST + import-graph parser (ts-estree/SWC; tree-sitter fallback), Redis-warmed **rule index**, matchers (`boundary|auth|pattern|naming|contract|dependency`), `driftScore`, autofix renderer (mustache → `CodeDiff`).
- `POST /drift/check` — **deterministic, P95 < 200ms**, hash-memoized; **scoped workspace-token auth**.
- **Async enrichment** → LLM (Sonnet-class) → **WebSocket** `drift.detected` (`whatHappened`, `impact`, contract diagrams, `autoFix`).
- Lifecycle: `GET /drift/{id}`, `apply-fix`, `ignore`; `drift_events` + `sync_architecture_drift_score` trigger.
- **Exceptions**: `request`, `review` (governance_lead) + notifications (Slack/email).
- Generation-time governance reuses matchers; audit for every drift/exception/fix.

**Exit criteria:** `/drift/check` **P95 < 200ms** (CI gate); alert (save→WS) **< 500ms**; each rule type has +/- fixtures; autofix validates against `CodeDiff`. ✅ Met (`pnpm gate:phase5`, 2026-05-29).

**Dependencies:** Phase 1 (rules/issues) + Phase 4 (architectures) + Redis/WS.

---

## Phase 6 — Bridge: Export Wizard + Dashboard

**Goal:** turn a locked architecture into IDE-ready artifacts and provide the return hub.

**Deliverables (backend)**
- **Export builder** (`apps/api/src/export`): `POST /architectures/{id}/export` rendering `.architectai/` (`manifest.json`, `rules.json`, `boundaries.json`, `forbidden-patterns.json`) + service contracts; formats **cursor-config | openapi | adr-markdown** at MVP (terraform/pulumi optional); artifacts to object storage; `architecture_exports` rows. Requires `status='ready'`.
- **Workspace registration**: `POST /cursor/workspaces` → create `cursor_workspaces` (local path hashed), **mint scoped token**, return `CursorConfig`; `GET /cursor/workspaces/{id}/config` (token auth) for the deep-link pull.
- Re-export on version bump → emit `architecture.updated`.

**Deliverables (frontend)**
- **Export Wizard** (Screen 9): 4-step track (choose **local workspace** + format → register → convert (terminal animation + artifact cards + IDE inline preview) → **deep-link launch** `cursor://…?token&arch`), share-with-team.
- **Dashboard** (Screen 5): Navbar (`⌘K`, New Architecture `⌘N`), 188px Sidebar (Drift Center badge), urgency banner, **`MyProjectCard`** vs **`TopArchCard`**, `NewArchModal`; **home routing = Dashboard if projects** else empty-state.

**Exit criteria:** export produces valid `.architectai/*` matching `CursorConfig`; deep-link URL well-formed; workspace token issued + config pull works (verified by a stub client); dashboard card types match `docs/05 §3.6`. ✅ Met (`pnpm gate:phase6`, 2026-05-29).

**Dependencies:** Phases 4–5.

---

## Phase 7 — Cursor / VS Code Extension (closes the loop)

**Goal:** the IDE half of the loop — connect via deep-link, govern, detect drift.

**Deliverables**
- Extension scaffold: activation + **deep-link URI handler** (`cursor://architectai/connect`), command registration, scoped-token store/refresh, **config pull** from server, write `.architectai/*` (local workspace).
- **Setup Panel** (Screen 6): confirm local workspace; "Initialize Workspace"; "Not now" bordered button; `⎋` dismiss.
- **File watcher**: `onDidSaveTextDocument` → `POST /api/drift/check`; respects monitored/ignored paths; client-side < 200ms budget.
- **Normal Panel** (Screen 7): "Governed" + model badge, MONITORING ACTIVE anti-pattern checklist (`AP-001/002/003 ✓ Clear`), context-loaded chat (`⌘L`), suggested questions.
- **Drift Panel** (Screen 8): multi-drift nav, severity banner, "what happened", Agreed-vs-Current diff, impact, **auto-fix diff**, actions — **"Accept & Apply Fix"**, "View Contract", equal-weight "Ignore drift" / "Request Exception", drift-score "deducts from governance grade", dismiss "won't remind again".
- **Decorators** (gutter + wavy), **status bar** ("⚠ N Critical Drift"), **WebSocket client** (`drift.detected` enrichment + `architecture.updated` → re-pull contracts).

**Exit criteria (full-loop demo):** Web create → Lock → Export → **deep-link opens IDE** → Setup pulls config → edit violating import → red gutter + toast → Drift Panel auto-fix → Accept → score restored → Normal; re-export from web updates IDE contracts. All `docs/05 §8` extension rules satisfied. ✅ Met (`pnpm gate:phase7`, 2026-05-29).

**Dependencies:** Phases 5–6.

---

## 🚩 Public Feedback MVP (end of Phase 7) — Ship It

**Goal:** the **complete loop** live for external users on lean hosting, instrumented for feedback.

**Ship checklist**
- Deploy web + api + 1 worker (Render/Fly); Neon/Supabase Postgres; Upstash Redis; Clerk (Google/GitHub); Sentry; pino logs (`new_architecture.md §12`).
- Publish the extension (private/marketplace) for early testers; verify the deep-link hand-off on macOS/Windows + the downloadable fallback.
- Smoke + latency budgets in prod (generation < 30s; drift < 200ms; SSE/WS reconnect).
- Feedback capture + privacy-friendly analytics (e.g. PostHog free); track **loop completion rate** (create → IDE active).

**Exit criteria:** external users complete the full loop in production; errors in Sentry; LLM cost visible per request; fixed infra ≈ $0–50/mo (LLM scales with use); first feedback flowing.

**Fast-follow (immediately after ship):** **live drift→Dashboard sync** onto project cards (plumbing already exists via `sync_architecture_drift_score` + WS); export-format expansion as requested.

---

## Phase 8 — Scale-Up & Compliance **[deferred — by config, not rewrite]**

**Goal:** graduate to enterprise scale/availability/compliance, **driven by traction**.

**Deliverables (turn on as needed)**
- Migrate hosting → AWS (ECS/EKS, **Multi-AZ RDS**, **ElastiCache**, ≥2 replicas, graceful drain).
- **Multi-region** (`eu-west-1`, GDPR) via `region` routing.
- **Enterprise auth**: Clerk SSO/SAML/Okta/Azure-AD.
- **GitHub App** integration (repo picker in Export, PR-diff governance checks in CI).
- **Premium observability**: OTel → Datadog (or self-hosted Grafana/Tempo/Loki); SLO dashboards/alerts.
- **Compliance**: pen-test, dependency/secret scanning gates, KMS at rest, **SOC2 Type II certification**.
- **Resilience**: queue retries/DLQ, blue/green deploys, dedicated `staging`.
- **Perf gates**: k6/Artillery in CI for generation (<30s) + drift (<200ms); rule-index warming at scale.

**Exit criteria:** NFR targets met at scale-up tier; SOC2 controls evidenced; multi-region failover rehearsed.

**Dependencies:** traction + relevant prior phases.

---

## Cross-Cutting Workstreams (continuous)

| Workstream | Practice |
|---|---|
| Shared contracts | OpenAPI (`docs/04`) + shared types (`docs/02`) as source; generated clients; contract tests |
| Testing | Vitest, Supertest, Playwright, LLM eval goldens |
| Provenance fidelity | Eval gates: **trace completeness** + **referential integrity** of every lineage `source.ref`; unresolved provenance flagged, never shown as fact |
| UX rules | Enforce the 13 non-negotiable UX rules (`new_PRD.md §6` / `docs/05 §8`) via review checklist + Playwright |
| Security | Fail-closed RLS tests, dependency + secret scanning per PR; scoped-token revocation tests |
| Docs | Keep `new_PRD.md`, `new_architecture.md`, ADRs current |

---

## Critical-Path Dependencies (build early)

1. **`packages/shared` types** (Phase 0) — unblocks everything.
2. **DB schema + RLS + tenant middleware + auth-upfront** (Phase 1) — gates all data access.
3. **LLM Gateway** (Phase 2) — used by interrogation, generation, chat, drift enrichment.
4. **Redis pub/sub** (Phases 3, 5) — SSE generation + drift WebSocket.
5. **Deterministic drift engine** (Phase 5, design from Phase 1) — the hardest latency constraint.
6. **Web↔IDE bridge** (Phases 6→7) — export builder + workspace token/config pull + deep-link; the piece that closes the loop.
7. **Decision Provenance Engine** (data D4 in Phase 1, capture in Phase 3, UI in Phase 4) — the flagship moat; design the lineage schema early so generation can populate it from day one.

---

## Suggested Team Tracks (parallelization)

- **Track A (Backend/Platform):** Phases 1 → 3 (worker/SSE) → 5 (engine) → 6 (export/bridge).
- **Track B (Frontend/Web):** Phases 2 → 4 → 6 (Wizard + Dashboard), against the OpenAPI contract.
- **Track C (AI):** LLM Gateway + prompts + RAG + eval harness (supports Phases 2–5).
- **Track D (Extension):** Phase 7, designed during Phases 5–6 (deep-link + token pull + webviews).

All tracks converge on the shared contract, the deterministic engine, and the Web↔IDE bridge — the components that make the loop real.
