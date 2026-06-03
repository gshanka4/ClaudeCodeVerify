# ArchitectAI — System Architecture (End-to-End)

**Version:** 2.0
**Date:** 2026-05-29
**Status:** Design baseline for a **lean, production-grade MVP** that ships the **full governance loop**
**Source of truth:** `docs/01–05` (PRD, Data Model, DB Schema, API Spec, Frontend Spec) · product framing in `new_PRD.md`

> **v2.0 change log.** The product is modeled as **one closed loop** — *create & lock in the Web app → export/hand-off into the IDE → govern & detect drift in Cursor/VS Code → return to the Web Dashboard.* The Export Wizard and Cursor extension are core, so the **MVP is the entire loop**. Locked architectures reuse the **`ready`** status. The Web→IDE hand-off is a **deep-link** that opens the IDE, after which the extension **pulls config using a scoped workspace token**. Workspaces bind to a **local path** (GitHub deferred). Auth is **required upfront**. Edits are **versioned** and re-export emits `architecture.updated`. Lean infrastructure + pay-for-LLM + scale-by-config all remain.

> **Build posture.** Production-grade quality at near-zero fixed infra cost. We pay for LLM usage + small SaaS free tiers. Quality is preserved; only operational scale (HA, multi-region, SSO/SAML, premium APM, SOC2 certification, GitHub integration) is deferred to a "scale-up" tier turned on by config, never a rewrite.

---

## 1. Product Summary & Surfaces

ArchitectAI converts engineering artifacts into governed, production-ready architectures, with drift detection and contract enforcement that follow engineers into their IDE.

| Surface | What it is | Tech | In MVP? |
|---|---|---|---|
| **Web App** | Landing, Interrogation, Generation, Workspace (+Lock), Dashboard, Export Wizard (Screens 1–5, 9) | React 18 SPA | ✅ |
| **API Platform** | REST + SSE + WebSocket, governance engine, AI orchestration, export builder, workspace-token issuer | Node/Express 5 | ✅ |
| **Cursor/VS Code Extension** | Setup, Normal (governed), Drift panels (Screens 6–8) | VS Code Extension + React webviews | ✅ |
| **Async Workers** | Generation jobs, export rendering, drift enrichment, notifications, audit | Node + BullMQ | ✅ |

Roles (`owner`, `architect`, `governance_lead`, `developer`, `viewer`) enforced at API (JWT) + DB (RLS). Org-level isolation is mandatory.

---

## 2. Architecture Principles

1. **The loop is the product.** Every component exists to move the user through create → lock → export → IDE govern → dashboard monitor. The Web↔IDE bridge (§8) is a first-class subsystem.
2. **Multi-tenant by construction.** Every tenant row carries `organization_id`; Postgres RLS is the last line of defense, set per request via `SET LOCAL app.current_organization_id`.
3. **The drift hot path is deterministic, not an LLM call.** `POST /api/drift/check` must answer **P95 < 200 ms** (fires on every save). Served by a static-analysis engine; LLM enrichment is asynchronous.
4. **AI behind a provider-agnostic gateway.** No business logic imports a vendor SDK directly.
5. **Everything important is an immutable audit event.** SOC2 evidence is a query.
6. **Contracts before code.** OpenAPI (`docs/04`) + shared TS types (`docs/02`) flow from one package across web/api/extension.
7. **Streaming-first UX.** Generation streams via SSE.
8. **Stateless API, externalized state.** State lives in Postgres + Redis → horizontal scale + cross-replica streaming.
9. **Lean by default, scale by config.** MVP on managed free/cheap tiers; HA/multi-region/SSO/APM/GitHub flip on later. Never trade correctness (RLS, isolation, validation, backups) for cost.
10. **Auth before action.** Sign-in is required before any create/lock/export; the extension uses scoped workspace tokens, never the user JWT.
11. **Every decision is traceable (provenance over narration).** No generated component ships without a structured, evidence-backed **Decision Lineage** (requirement → constraint → pattern → rejected alternatives → rules → contracts → implications). Reasoning is *proven*, not narrated. This is the flagship capability (see the **Decision Provenance Engine** section).

---

## 3. Technology Stack

### 3.1 Monorepo & tooling

| Concern | Choice |
|---|---|
| Repo | **pnpm workspaces + Turborepo** (`apps/web`, `apps/api`, `apps/cursor-extension`, `packages/shared`, `packages/config`, `infra/`) |
| Language | **TypeScript 5.x (strict)** everywhere |
| Lint/format | ESLint + Prettier + typescript-eslint |
| Testing | Vitest (unit), Supertest (API), Playwright (e2e) |
| Hooks/CI | Husky + lint-staged + commitlint; GitHub Actions |

### 3.2 Frontend (`apps/web`)

React 18 + Vite · TypeScript (strict) · Tailwind (dark-only, tokens from `docs/05 §1`) · **TanStack Query v5** · **Zustand** · **React Flow** (canvas) · React Router v6 (`AuthGuard`, `roleRequired`) · **Clerk React** · React Hook Form + Zod · lucide-react · Inter + JetBrains Mono · Axios + OpenAPI-generated clients.

### 3.3 Backend (`apps/api` + workers)

Node 22 LTS · **Express 5** · TypeScript · **Drizzle ORM** · **PostgreSQL 16** (`pgcrypto`, `pg_trgm`, `pgvector`) · **Zod** (+ `drizzle-zod`) · **Clerk** JWT verify + scoped workspace tokens · **Redis 7** (rate limit, SSE fan-out, drift cache, sessions) · **BullMQ** (generation, export, enrichment, notify, audit) · **SSE** + **WebSocket (`ws`)** · OpenAPI 3.1 runtime validation (`express-openapi-validator`).

### 3.4 Static-analysis / governance engine (drift hot path)

`@typescript-eslint/typescript-estree` / **SWC** for TS/JS AST + import-graph · **tree-sitter** fallback (Python/Go/Java) · in-house **rule matcher** for `RuleCondition` (boundary/auth/pattern/naming/contract/dependency) · compiled per-architecture **rule index** warmed in Redis · **zero LLM** on the hot path.

### 3.5 AI / LLM layer

In-house **LLM Gateway** (provider-agnostic, streaming, structured output + Zod validation, retries, cost metering, prompt registry) · **Vercel AI SDK** for streaming/tool-calling · **pgvector** RAG over rules/ADRs/prior architectures · versioned, eval-gated prompts.

### 3.6 Infrastructure & ops — two tiers

Application code is identical across tiers; only providers/config change. Cost in §12.

| Concern | **Lean (MVP default)** | **Scale-up (enterprise)** |
|---|---|---|
| Containers | Docker (multi-stage) | same |
| Hosting | **Render / Fly.io** (web + api + 1 worker) | **AWS ECS Fargate → EKS** |
| Database | **Neon / Supabase** PG16 (pgvector, pg_trgm) | **AWS RDS PG16 Multi-AZ**, US + EU (GDPR) |
| Cache/queue | **Upstash Redis** | **ElastiCache (Redis 7)** |
| Object storage | **Cloudflare R2 / S3 low tier** | **S3** + lifecycle |
| CDN | Cloudflare / host CDN | CloudFront |
| Secrets | host secret store | AWS Secrets Manager |
| Observability | OTel SDK + **pino** + **Sentry free** | OTel → Datadog / self-hosted Grafana |
| Email/notify | **Resend free** + Slack webhook | SES + Resend + Slack |
| Repo integration | **local workspace path** | **GitHub App** (repo picker, PR checks) |

> **MVP cost:** LLM usage (only unavoidable cost) + ~$0–50/mo fixed infra.

---

## 4. AI / Model Strategy

Five workloads, routed through the LLM Gateway so any model swaps per workload via config.

| # | Workload | Latency | Quality | **Recommended** | Fallback |
|---|---|---|---|---|---|
| 1 | **Architecture generation** | streamed, full flow < 30s | **Highest** | **Claude Opus-class** | GPT-5-class / Gemini 2.x Pro |
| 2 | **Interrogation question gen** | sub-second/turn | High | **Claude Sonnet-class** | GPT-5-mini class |
| 3 | **Drift explanation + auto-fix** | async (off hot path) | High (code-aware) | **Claude Sonnet-class** | GPT-5-class |
| 4 | **Workspace "Ask the architecture" / RAG** | streaming | Med-High | **Claude Sonnet-class** + pgvector | GPT-5-mini class |
| 5 | **Embeddings (RAG/search)** | fast, batch | n/a | strong text-embedding model | — |

**Drift is split:** detection = deterministic engine (no LLM, < 200ms); explanation/auto-fix = async LLM pushed over WebSocket so the IDE save never blocks.

**Gateway responsibilities:** model routing per workload, streaming, `generateStructured(schema)` with Zod validation + bounded repair retry, timeouts/fallbacks, cost/token accounting → audit + metrics, versioned prompt registry. **Vendor SDKs imported only inside the gateway.**

**Safety:** user artifacts treated as untrusted (prompt-injection isolation); structured-output contracts; CI eval harness with golden cases; per-org token budgets; cancellable generation.

---

## 5. System Topology

```
                         ┌───────────────────────────────────────────────┐
                         │                  Clients                        │
                         │   Web SPA (React)        Cursor/VS Code Ext      │
                         └──────┬───────────────────────────┬──────────────┘
                                │ HTTPS / SSE                 │ HTTPS + WSS (scoped token)
                                ▼                             ▼
                         ┌───────────────────────────────────────────────┐
                         │            Edge / Load Balancer                  │
                         └──────┬───────────────────────────┬──────────────┘
                                ▼                             ▼
                    ┌──────────────────────┐     ┌──────────────────────────┐
                    │   API service (Express 5)   │   WebSocket service (ws)  │
                    │  REST(OpenAPI)·SSE·Clerk JWT │  drift.detected /         │
                    │  governance engine·LLM GW    │  architecture.updated     │
                    │  export builder·WS-token mint│  (scoped-token auth)      │
                    └───┬───────────┬───────┘                 │
            jobs        │           │ pub/sub (Redis)          │
            ┌───────────▼───┐   ┌───▼───────────────┐          │
            │ BullMQ Workers │   │   Redis            │◄─────────┘
            │ gen·export·    │   │ ratelimit·SSE fan- │
            │ enrich·notify  │   │ out·drift cache    │
            └───────┬────────┘   └─────────┬──────────┘
                    ▼                       ▼
            ┌─────────────────────────────────────────┐     ┌───────────────┐
            │   PostgreSQL 16 (RLS) + pgvector + trgm   │     │ Object storage│
            └─────────────────────────────────────────┘     │ (export blobs)│
                    ▲                                          └───────────────┘
                    │ external:  Clerk · LLM providers · Resend/Slack
```

---

## 6. Component Architecture

### 6.1 Web app (`apps/web`)

Per `docs/05 §2`. Routing reflects the loop and **auth-upfront / dashboard-as-home**:

```tsx
'/'                         → LandingPage (public marketing; hero CTA requires sign-in)
'/dashboard'                → DashboardPage      (AuthGuard) — home if user has projects
'/interrogate/:sessionId'   → InterrogationPage  (AuthGuard)
'/generate/:architectureId' → GenerationPage     (AuthGuard)
'/workspace/:architectureId'→ WorkspacePage      (AuthGuard) — includes Lock + Export entry
'/export/:architectureId'   → ExportWizardPage   (AuthGuard) — Screen 9, deep-links to IDE
'/governance'               → GovernancePage      (roleRequired: architect)
'/audit'                    → AuditPage           (roleRequired: governance_lead)
```

- **Post-auth redirect:** authenticated users → `/dashboard` **if they have ≥1 project**, else `/` create empty-state.
- **Lock:** generation already sets `status = ready` (exportable). The Workspace **Lock** action finalizes by taking a **`version` snapshot** that becomes the export baseline (stamped into `manifest.json`). Export requires `ready`; Lock determines *which version* is exported. There is no separate "locked" status.
- **Decision Trace is primary on node click.** Selecting a node enters **Decision Trace mode**: the right panel renders the component's **Decision Lineage** (causal chain) as the top/primary content, with status banner + confidence kept compact above it, and issues / metadata / "Implement a change" demoted below. The default (no-selection) AI Reasoning panel keeps the **actionable urgency triage** but its previous **per-layer prose narration is replaced by lineage entry points** + a toggle to the full **Architecture Lineage Graph**. (See the Decision Provenance Engine section.)
- **Non-negotiable UI rules** (`docs/05 §8`) enforced: dark-only, `<kbd>` shortcuts, no right-panel tabs (mode = `selectedServiceId`), 48px toolbar, "Accept & Apply Fix", equal-weight Ignore/Request-Exception, drift-score sub-text, always-cancellable generation, two dashboard card types, wrench `size={16}`.

### 6.2 API service (`apps/api`)

```
src/
├── routes/ controllers/ services/   # architectures, interrogation, generation, drift,
│                                     # governance, exceptions, exports, workspaces, audit
├── engine/   # deterministic governance/drift static analysis
├── ai/       # LLM Gateway, prompt registry, RAG retriever
├── realtime/ # SSE manager + Redis pub/sub bridge; WS server
├── export/   # .architectai/* builder (manifest, contracts, rules, forbidden-patterns) + IaC/ADR renderers
├── db/       # Drizzle schema (mirrors docs/03), migrations, RLS helpers
├── middleware/ # clerkAuth, workspaceTokenAuth, tenantContext (SET LOCAL), rateLimit, validate, errorHandler
├── workers/  # BullMQ processors
└── lib/      # logger(pino), config, otel
```

Per-request **tenant context**: verify Clerk JWT → resolve `{userId, organizationId, role}` → open txn → `SET LOCAL app.current_organization_id/current_user_id` → all RLS policies enforced.

**Workspace token auth:** `workspaceTokenAuth` middleware validates the scoped token issued by `POST /cursor/workspaces` for extension calls (`/drift/check`, config pull, WS).

### 6.3 Governance / drift engine (`apps/api/src/engine`)

```
parser/ (AST + import graph; ts-estree/SWC; tree-sitter fallback)
ruleIndex/ (per-architecture compiled index, cached in Redis)
matchers/ (boundary|auth|pattern|naming|contract|dependency)
driftScore.ts · autofix/ (mustache → CodeDiff)
```

Generation-time (graph) and code-time (file/diff) evaluation share matchers; only the input adapter differs.

### 6.4 Cursor / VS Code extension (`apps/cursor-extension`)

Per `docs/05 §7`:

```
extension.ts            # activation (incl. deep-link URI handler) + commands
auth/tokenStore.ts      # store/refresh scoped workspace token
config/workspaceConfig.ts # pull config from server by token; write .architectai/*
watchers/fileWatcher.ts # onDidSaveTextDocument → POST /api/drift/check (< 200ms)
panels/{SetupPanel,NormalPanel,DriftPanel}.ts  # React webviews (Screens 6/7/8)
decorators/driftDecorator.ts  # red gutter + wavy underlines
statusBar/driftStatus.ts      # "⚠ N Critical Drift"
ws/client.ts            # receive drift.detected enrichment + architecture.updated
```

Binds to a **local workspace path** (hashed → `workspace_hash`). Receives async drift enrichment + version updates over WebSocket.

---

## 7. Data Architecture

Relational model fully in `docs/03`. Notes for v2.0:

- **"Locked" reuses `status = 'ready'`** — no schema change to `architecture_status`. Lock is an application action that ensures `ready` + snapshots `version` and writes an audit event (reuses `architecture.generated`; an optional `architecture.locked` type is tracked as spec delta **D2** in §10.1).
- **Versioning:** `architectures.version` increments on edit-after-lock; re-export emits `architecture.updated` (`CursorWsMessage`). Connected `cursor_workspaces` are notified.
- **Workspaces:** `cursor_workspaces` stores `workspace_path` (hashed), `api_token` (scoped), `monitored_paths`, `ignored_paths`. **No GitHub fields at MVP.**
- **Multi-tenancy:** RLS on all tenant tables keyed on `app.current_organization_id`.
- **Search:** `pg_trgm` GIN on `architectures.name`.
- **Audit:** range-partitioned monthly, append-only (SOC2).
- **Triggers:** `set_updated_at()`; `sync_architecture_drift_score()` keeps `architectures.drift_score` = sum of open drift penalties (this is what eventually feeds dashboard cards once drift→dashboard sync lands).
- **Vector store:** `pgvector` table for RAG embeddings.
- **Shared types:** `docs/02` in `packages/shared`, imported by web/api/extension.

### 7.1 Redis key spaces

| Key | Purpose | TTL |
|---|---|---|
| `ratelimit:{scope}:{id}` | token buckets | rolling |
| `gen:stream:{architectureId}` | SSE pub/sub fan-out | session |
| `gen:state:{architectureId}` | progress snapshot (reconnect) | hours |
| `drift:ruleidx:{architectureId}` | warmed compiled rule index | until invalidated |
| `drift:cache:{archId}:{fileHash}` | memoized drift result | minutes |
| `wstoken:{workspaceId}` | scoped-token validation cache | token TTL |

---

## 8. The Web↔IDE Bridge (core subsystem)

This is the part that makes governance real. Flow when the user clicks **Export** on a locked (`ready`) architecture:

```
WEB (Export Wizard, Screen 9)                         API                         IDE (extension)
  1. choose local workspace + format ──► POST /architectures/{id}/export ─► build .architectai/* (manifest, contracts,
                                                                            rules, forbidden-patterns) → store
  2. register workspace ─────────────► POST /cursor/workspaces ──────────► create cursor_workspaces row,
                                                                            mint scoped api_token, return CursorConfig
  3. deep-link launch ───────────────► cursor://architectai/connect?token=...&arch={id}
                                                                          ─► OS opens Cursor/VS Code
                                                                             extension URI handler fires
  4.                                    GET /cursor/workspaces/{id}/config ◄─ extension pulls config (scoped token)
  5.                                                                          writes .architectai/*, shows Setup (S6)
                                                                            → Normal/Governed (S7); watcher armed
  6. (coding) save ──────────────────► POST /api/drift/check (< 200ms) ───► deterministic result
                                          └─(async) enrich ─► WS: drift.detected ─► Drift panel (S8)
  7. (web edits → re-lock → re-export) ─► version++ ─► WS: architecture.updated ─► extension refreshes contracts
```

**Hand-off mechanism (confirmed):** **deep-link** (`cursor://` / VS Code URI) opens the IDE; the extension **pulls config from the server with the scoped workspace token**. A downloadable `.architectai/` bundle is an acceptable fallback if the deep-link can't fire.

**Return to web:** switching back to the Web app routes to **Dashboard if the user has projects**. Drift detected in the IDE is persisted server-side; **surfacing it live on dashboard cards is a fast-follow** (the `drift_score` trigger + a poll/WS already provide the plumbing).

---

## ★ Decision Provenance Engine (Decision Lineage) — Flagship Subsystem

The provenance engine makes every architectural decision **traceable**, not just narrated. It is the product's primary trust differentiator (PRD §6A). It is a first-class subsystem touching the generation pipeline, data model, API, and Workspace UI.

### Data model

A per-architecture **lineage graph** (typed nodes + causal edges) plus a per-component **Decision Trace** (a rooted slice of that graph). Captured at generation time, persisted, and queryable. Types are spec delta **D3** (§10.1):

```ts
type LineageNodeType =
  | "requirement"   // from an interrogation answer or input-PRD span
  | "constraint"    // inferred constraint (e.g. P95 latency threshold, retry semantics)
  | "pattern"       // the selected pattern/technology (maps to the component)
  | "alternative"   // a rejected alternative
  | "rule"          // governance rule that influenced/overrode the choice
  | "contract"      // resulting service contract
  | "component"     // the architecture service node
  | "assumption"    // an inferred assumption
  | "implication";  // downstream implication

type LineageEdgeType =
  | "derives"   // requirement → constraint
  | "selects"   // constraint → pattern (chosen)
  | "rejects"   // pattern ↔ alternative (with reason)
  | "governs"   // rule → pattern (preferred / required / overrode-alternative)
  | "produces"  // pattern/component → contract
  | "impacts"   // component → downstream component / implication
  | "assumes";  // pattern → assumption

interface LineageNode {
  id: string; type: LineageNodeType; label: string; detail: string;
  source?: { kind: "interrogation" | "prd-span" | "rule" | "metric" | "inference"; ref: string; confidence: number };
}
interface LineageEdge { id: string; fromNodeId: string; toNodeId: string; type: LineageEdgeType; rationale: string; }

interface DecisionTrace {            // one per component (service)
  serviceId: string;
  summary: string;                   // "Chosen because…"
  requirementNodeIds: string[];
  constraintNodeIds: string[];
  selectedPatternNodeId: string;
  rejectedAlternativeNodeIds: string[];
  governanceRuleNodeIds: string[];
  contractNodeIds: string[];
  downstreamImplicationNodeIds: string[];
  assumptionNodeIds: string[];
  confidence: number;
}
interface ArchitectureLineage { architectureId: string; nodes: LineageNode[]; edges: LineageEdge[]; traces: DecisionTrace[]; }
```

> Note: `ArchService.rationale` and `ArchService.alternatives[]` already exist in `docs/02` — they become *inputs to* the lineage, not a replacement for it. The new structure adds the **typed causal links to requirements and rules** that turn narration into provenance.

### Persistence (spec delta D4, §10.1)
- `decision_lineage_nodes(id, architecture_id, type, label, detail, source_kind, source_ref, confidence)`
- `decision_lineage_edges(id, architecture_id, from_node_id, to_node_id, type, rationale)`
- `decision_traces(architecture_id, service_id, trace_json)` — cached resolved trace per component.
- All architecture-scoped → covered by the same **RLS** policy as architectures. `component`-type nodes carry the `service_id` to bind trace ↔ canvas node.

### Capture at generation time (the hard part)
The generation model (Opus-class) must emit lineage **as structured, schema-validated output** — never free prose. The generation prompt is grounded with: the **interrogation answers** (→ `requirement` nodes), the **input PRD spans**, and the **active governance ruleset** (→ `rule` nodes, including *selection-preference* rules like "MQ-04 prefers Kafka > RabbitMQ above 50K TPS"). For each component the model produces its `DecisionTrace` + contributing nodes/edges; the gateway validates with Zod and the engine cross-checks that referenced requirement/rule IDs actually exist (no fabricated provenance). Lineage streams alongside nodes (SSE `lineage` event, delta **D6**).

> This means governance rules gain a *selection-influence* dimension (preferred/required/overrode), not just enforcement. Captured in lineage `rule` nodes + `governs` edges; the rule catalog itself is unchanged.

### API (spec delta D5, §10.1)
- `GET /architectures/{id}/lineage` → `ArchitectureLineage` (full graph; powers the Lineage Graph view).
- `GET /architectures/{id}/services/{serviceId}/trace` → resolved `DecisionTrace` with embedded nodes (powers Decision Trace mode).

### UI (Architecture Workspace)
- **Decision Trace mode** is the **top-priority** right-panel content on node selection: ordered, expandable causal chain (Requirement → Constraint → Selected Pattern → Rejected Alternatives → Governance Rules → Contracts → Downstream Implications) + Assumptions + Evidence; each step expands to its `source` + confidence. Existing status/issues/metadata become secondary sections beneath it.
- **Architecture Lineage Graph**: a toolbar toggle rendering the full typed graph (reuses React Flow), color-coded by node type; selecting a node focuses its trace; edges labeled by `rationale`.
- **Anti-hallucination guard:** the UI only renders trace nodes whose `source.ref` resolved server-side; unresolved provenance is flagged rather than shown as fact.

### Fidelity controls
- Generation eval goldens assert **trace completeness** (every component has requirement + constraint + ≥1 rule or explicit "no rule" + contracts) and **referential integrity** (every `source.ref` resolves).
- A component cannot reach `status=ready`/export without a complete trace (provenance is part of "done").

---

## 9. Real-Time Pipelines

### 9.1 Generation (SSE)
`POST /generate/start` → create `architecture(draft)` + enqueue → `202 {architectureId, streamUrl}`. Worker loads session (interrogation answers + PRD spans) + active ruleset + RAG, calls `gateway.stream(generation)`, emits Zod-validated `node|governance|lineage|progress|complete` events; API bridges via **Redis pub/sub** to the SSE connection (cross-replica + reconnect via `gen:state`). The `lineage` events carry the **Decision Lineage** nodes/edges/traces (Provenance Engine) captured alongside each component, validated for referential integrity before persistence. Cancel reverts to `draft`. Budget **P95 < 30s**.

### 9.2 Drift (hot path + async enrichment)
`POST /drift/check` → deterministic engine on warmed index → **P95 < 200ms** `{hasDrift, drifts(minimal), driftScore}`; memoized by file hash. Async: enqueue → LLM (Sonnet-class) builds `whatHappened`/`impact`/contract diagrams/`autoFix` → **WS push** `drift.detected`. Lifecycle: `/drift/{id}/apply-fix|ignore`, `/exceptions/request`; triggers keep scores consistent.

### 9.3 Re-export / version update
Edit-after-lock bumps `version`; re-export pushes `architecture.updated` over WS → extension re-pulls contracts.

### 9.4 Dashboard freshness
Poll `/architectures` for status/cards; `architecture.updated` invalidates React Query caches. Live drift aggregation onto cards = fast-follow.

---

## 10. API Surface

Authoritative: `docs/04` (OpenAPI 3.1), runtime-validated. Groups: System (`/healthz`); Architectures (CRUD + `/{id}/export`); Interrogation (`start|answer|skip|edit`); Generation (`start|stream|cancel`); Drift (`check`<200ms, list, `apply-fix`, `ignore`); Exceptions (`request`, `review`); Governance (rulesets); Cursor (`POST /workspaces` → token+config, `GET /workspaces/{id}/config` for the token pull); Audit. Rate limits: generate 10/min/user, drift 120/min/workspace, default 300/min/user.

> v2.0 addition: a config-pull endpoint (`GET /cursor/workspaces/{id}/config`, scoped-token auth) supports the deep-link hand-off (§8). Authenticated-only product (no anonymous routes).

### 10.1 Spec deltas (documented additions to `docs/`)

The confirmed v2.0 flow requires the additions below to the original source specs (D1–D2 for the loop, D3–D6 for the Provenance Engine). **These are intentionally documented here only — `docs/01–05` remain unchanged.** Apply them to the source specs when convenient; until then, this section is the authoritative reference.

| # | Delta | Where it belongs | Why |
|---|---|---|---|
| D1 | `GET /cursor/workspaces/{id}/config` — returns `CursorConfig`, **scoped workspace-token auth** | `docs/04` OpenAPI, under the **Cursor** tag | The extension pulls its config after the deep-link hand-off (§8 step 4); not currently in the spec |
| D2 | `architecture.locked` audit event type (optional) | `docs/02` `AuditEventType` union | The Workspace **Lock** action (§6.1, §7) should emit a distinct audit event; today it would reuse `architecture.generated` |
| **D3** | **Decision Lineage types** — `LineageNode`, `LineageEdge`, `DecisionTrace`, `ArchitectureLineage` (+ `LineageNodeType`/`LineageEdgeType`) | `docs/02` data model | Provenance Engine data model; turns rationale/alternatives into a typed causal graph |
| **D4** | **Lineage tables** — `decision_lineage_nodes`, `decision_lineage_edges`, `decision_traces` (architecture-scoped, RLS) | `docs/03` schema | Persist + query the provenance graph and per-component traces |
| **D5** | **Lineage API** — `GET /architectures/{id}/lineage`, `GET /architectures/{id}/services/{serviceId}/trace` | `docs/04` OpenAPI, **Architectures** tag | Powers the Lineage Graph view + Decision Trace mode |
| **D6** | **`lineage` SSE event** — add to `GenerationStreamEvent` union (`{ type: "lineage"; payload: { nodes; edges; trace } }`) | `docs/02` event types + `docs/04` stream docs | Stream provenance alongside `node` events during generation |
| **D7** | **Verification types** — `VerificationRun`, `VerificationFinding`, `VerificationOverride`, `VerificationCheck`, `VerificationVerdict`, `VerificationTier`, `ComponentVerdictRollup`, `TrustGradeBreakdown`, `VerificationStreamEvent` (`verification.*` prefix) | `packages/shared` · `docs/02` | v3.0 correctness layer data model (`new_PRD_updated.md` §11) |
| **D8** | **Verification tables** — `verification_runs`, `verification_findings`, `verification_overrides` (architecture-scoped, RLS); audit types `architecture.verified`, `architecture.override_recorded` | `docs/03` schema | Persist independent verification runs + findings + immutable overrides |
| **D9** | **Verification API** — `POST /architectures/{id}/verify`, `GET …/verification`, `GET …/services/{serviceId}/verification`, `POST …/findings/{findingId}/override`, `GET …/verification/stream/{runId}` (SSE); **modify** `POST …/lock` → 409 `verification_gate_failed`; **modify** export manifest with verification stamp | `docs/04` OpenAPI, **Verification** tag | Triggers pass, streams findings, gates Lock, stamps export |
| **D10** | **Verification UX** — Generation → Verification Pass view; Workspace panel order (Lineage above Verification); canvas verdict colors; Lock gate modal; Trust Grade badge; UX rules 14–19 | `docs/05` §8.1 | Spatial trust UX (`new_PRD_updated.md` §4–§5) |

**Deferred (fast-follow, not MVP):** **D11** — `reference_patterns` pgvector table + `pattern.reference` check · **D12** — `capability_reference` table + `constraint.satisfiability`.

All deltas are additive and backward-compatible. D3–D6 implement the **Decision Provenance Engine**; D7–D10 implement the **Verification Pass** (v3.0). No other spec changes are needed.

---

## 11. Security, Privacy & Compliance

- **AuthN:** Clerk, **required upfront**; all routes except `/healthz` need a Bearer JWT. Extension uses scoped, revocable workspace tokens (validated via `wstoken:*` cache).
- **AuthZ:** route role checks + DB RLS (defense in depth).
- **Tenant isolation:** `organization_id` + RLS + per-request `SET LOCAL`; automated fail-closed RLS tests.
- **Workspace privacy:** local paths hashed (`workspace_hash`); file contents to `/drift/check` processed transiently, not persisted by default.
- **LLM safety:** untrusted-input handling, structured-output validation, per-org token budgets.
- **Encryption:** TLS in transit; managed-provider at-rest (MVP) → KMS (scale-up).
- **Audit:** immutable partitioned log of every meaningful action (`AuditEventType`), exportable JSON/CSV.
- **SOC2:** controls (RLS, audit, RBAC, encryption) built day one; **certification deferred** to scale-up.
- **Data residency:** single-region MVP; EU region (GDPR) is a scale-up switch (`region` enum present).

---

## 12. NFRs, Cost & Deployment

### 12.1 Budgets

| Metric | Target | How |
|---|---|---|
| Generation (end-to-end) | **P95 < 30s** | Streamed, RAG-grounded, parallel governance checks |
| Drift check (save→response) | **P95 < 200ms** | Deterministic engine, warmed Redis index, no LLM |
| Drift alert (save→alert) | **< 500ms** | Fast detect + async WS enrichment |
| Loop completion (create→IDE active) | primary activation metric | Smooth deep-link hand-off + token pull |
| API availability | MVP ~99% → Scale-up 99.9% | HA added by config |

> The two latency budgets hold in **both** tiers — they're product quality, not scale features. Only availability/redundancy relaxes at MVP.

### 12.2 Cost & hosting tiers

**Lean (MVP) fixed cost ≈ $0–50/mo** + LLM usage:

| Item | Provider (free/cheap) | ~Monthly |
|---|---|---|
| Postgres (pgvector, trgm) | Neon / Supabase | $0–25 |
| Redis | Upstash | $0 |
| Hosting (web+api+worker) | Render / Fly.io | $0–25 |
| Auth | Clerk free | $0 |
| Errors/logs | Sentry free + pino | $0 |
| Object storage | Cloudflare R2 / S3 | $0–5 |
| Email | Resend free | $0 |

**LLM levers (keep quality):** top-tier model for **generation only**; Sonnet-class elsewhere; **deterministic drift = $0 tokens**; prompt caching; RAG grounding; per-org budgets; capped output; cancellable generation.

**Scale-up (by config, no rewrite):** AWS ECS/EKS, Multi-AZ RDS, ElastiCache, multi-region (US/EU), Clerk enterprise SSO/SAML, Datadog APM, GitHub App integration, SOC2 Type II certification.

### 12.3 Environments

| Env | MVP setup |
|---|---|
| `local` | Docker Compose: Postgres + Redis + api + web + worker; seeded default ruleset (`docs/03`) |
| `production` | Render/Fly: web + api + 1 worker; Neon Postgres; Upstash Redis |

Pipeline: **lint → typecheck → unit → api → build → e2e → migrate (Drizzle) → deploy → smoke.** Forward-only migrations.

### 12.4 External accounts & environment (build prerequisites)

Provision these free/cheap accounts before Phase 0; all are scale-up-compatible (§12.2).

| Service | Used for | MVP tier |
|---|---|---|
| **Neon / Supabase** | Postgres 16 (pgvector, pg_trgm) | free |
| **Upstash** | Redis (rate-limit, SSE fan-out, drift cache, WS-token cache) | free |
| **Render / Fly.io** | host web + api + 1 worker | free/low |
| **Clerk** | auth (JWT + webhooks) | free |
| **Anthropic** | Opus-class (generation) + Sonnet-class (interrogation/chat/drift) | usage |
| **OpenAI (or equiv.)** | embeddings + model fallback | usage |
| **Cloudflare R2 / S3** | export `.architectai/*` blobs | free/low |
| **Sentry** | errors | free |
| **Resend** + Slack webhook | notifications | free |
| **PostHog** (optional) | loop-completion analytics | free |

**Required env vars** (per `apps/api` / `apps/web`; never commit — use host secret store / `.env.local`):

```
# Core
APP_ENV=local|production
WEB_BASE_URL=...            API_BASE_URL=...            WS_URL=...
DATABASE_URL=postgres://... REDIS_URL=rediss://...
# Auth (Clerk)
CLERK_PUBLISHABLE_KEY=...   CLERK_SECRET_KEY=...        CLERK_WEBHOOK_SECRET=...
# Web↔IDE bridge
WORKSPACE_TOKEN_SECRET=...  DEEPLINK_SCHEME=cursor      # scoped-token signing + deep-link
# LLM Gateway (provider-agnostic; routed per workload)
ANTHROPIC_API_KEY=...       OPENAI_API_KEY=...          LLM_MODEL_GENERATION=... LLM_MODEL_ASSIST=... EMBEDDING_MODEL=...
# Object storage
R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... EXPORT_BUCKET=...
# Observability / notify
SENTRY_DSN=...              RESEND_API_KEY=...          SLACK_WEBHOOK_URL=...   # Slack optional/per-org
```

> Org-level Slack webhooks may live as a tenant setting rather than a global env var. LLM model slugs are config, not code — swapping a model is an env change, per Principle 4.

---

## 13. Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Drift hot path > 200ms | Deterministic engine, warm Redis index, hash memoization, CI load gate |
| Deep-link hand-off friction (browser/OS variance) | Robust URI handler + downloadable `.architectai/` fallback + clear setup UI |
| Web↔IDE token leakage | Scoped, short-lived, revocable workspace tokens; never the user JWT; `wstoken` cache invalidation |
| LLM latency/variance | Streaming, model routing, structured-output + repair retries, cancellable jobs |
| Multi-tenant leak | RLS + `SET LOCAL` + automated fail-closed tests |
| Provider lock-in/outage | Gateway abstraction + per-workload fallbacks |
| SSE scale across replicas | Redis pub/sub fan-out + state snapshot reconnect |
| Version/contract drift between web & IDE | `architecture.updated` push + version stamps in `.architectai/manifest.json` |
| **Fabricated provenance** (LLM invents requirements/rules in lineage) | Server-side **referential-integrity check** of every `source.ref` (must resolve to a real interrogation answer / PRD span / rule); unresolved provenance flagged, never shown as fact; trace-completeness eval gate |

---

## 14. Mapping: Loop stage → Screen → Backend → Model

| Loop stage | Screen | API | AI workload |
|---|---|---|---|
| Sign in | (Clerk) | — | — |
| Create | 1 Landing | `POST /interrogate/start` | — |
| Gather | 2 Interrogation | `/interrogate/{id}/answer\|skip\|edit` | Interrogation (Sonnet) |
| Generate | 3 Generation (SSE) | `/generate/start\|stream\|cancel` (+ `lineage` events) | Generation + **provenance capture** (Opus) + RAG |
| Inspect+Lock | 4 Workspace | `GET /architectures/{id}`, **`/{id}/lineage`**, **`/services/{sid}/trace`**, lock, `/{id}/export` | Decision Trace (provenance) + Chat/RAG (Sonnet) |
| Bridge | 9 Export Wizard | `POST /architectures/{id}/export`, `POST /cursor/workspaces`, config pull | ADR text (LLM); templated IaC |
| Connect | 6 Cursor Setup | `GET /cursor/workspaces/{id}/config` | — |
| Govern | 7 Cursor Normal | `/drift/check` (clear) | Chat (Sonnet) |
| Drift | 8 Cursor Drift | `/drift/check`, `apply-fix`, `ignore`, `/exceptions/request` | Drift enrichment (Sonnet) |
| Monitor | 5 Dashboard | `/architectures`, `/drift` | — |

---

*See `IMPLEMENTATION_PLAN.md` for the sequenced, phase-wise build plan.*
