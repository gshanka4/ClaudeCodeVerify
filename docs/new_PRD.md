# ArchitectAI — Product Requirements (Working PRD)

**Version:** 2.0
**Date:** 2026-05-29
**Status:** Active — drives the lean, production-grade MVP build
**Owner:** Product
**Related documents:**
- `docs/01_ARCHITECTAI_PRD.md` — original product spec (9 screens, flows, UX rules)
- `docs/02_ARCHITECTAI_DATA_MODEL.ts` · `docs/03_ARCHITECTAI_DATABASE_SCHEMA.sql` · `docs/04_ARCHITECTAI_API_SPEC.yaml` · `docs/05_ARCHITECTAI_FRONTEND_SPEC.md`
- `new_architecture.md` — end-to-end system architecture & tech/model strategy
- `IMPLEMENTATION_PLAN.md` — phase-wise build plan

> **What this document is.** A consolidated working PRD that captures the *shared understanding* of ArchitectAI as a **closed governance loop** and explains why `new_architecture.md` and `IMPLEMENTATION_PLAN.md` exist. The original `docs/01–05` remain the detailed source of truth for screen-level behavior, data shapes, and API contracts; this PRD frames product intent, the end-to-end flow, the scope decisions, and the MVP strategy.

> **v2.0 change log.** Corrected the core product model: ArchitectAI is **one continuous loop** — *create & lock in the Web app → export/hand off into the IDE → govern & detect drift in Cursor/VS Code → return to the Web Dashboard to monitor.* The Export Wizard and the Cursor extension are **not peripheral add-ons** — they are the bridge and the destination that make governance real. The first shippable MVP is therefore the **entire loop**.

---

## 1. Why these documents exist

| Document | Purpose | Answers |
|---|---|---|
| **`new_PRD.md`** (this file) | Product intent, the end-to-end loop, scope, MVP strategy, success metrics | *What are we building, for whom, in what order — and why?* |
| **`new_architecture.md`** | End-to-end technical design: topology, tech stack, AI/model strategy, the Web↔IDE bridge, the **Decision Provenance Engine**, data, real-time, security, cost/hosting tiers, NFRs | *How is it built, with what tech and which models, at what cost?* |
| **`IMPLEMENTATION_PLAN.md`** | Sequenced phase-wise delivery (0–8), exit criteria, deferred scale-up items | *In what order do we build it, and when is it shippable?* |

**Reading order:** this PRD → `new_architecture.md` → `IMPLEMENTATION_PLAN.md` → detailed `docs/01–05` as needed.

---

## 2. Product vision

ArchitectAI is an **enterprise AI architecture governance platform**. It converts any engineering artifact — PRDs, Jira epics, Swagger/OpenAPI files, or plain-English descriptions — into **governed, production-ready software architectures**, with **drift detection**, **contract enforcement**, and **real-time AI reasoning** built in.

**Core promise:** *From requirement to a governed architecture in under 30 seconds — and governance that follows your engineers into their IDE.*

**The wedge:** architecture decisions today rot in stale docs nobody enforces. ArchitectAI makes architecture **executable governance** — rules defined once are enforced at generation time (Web), at code time (IDE extension), and surfaced back for monitoring (Dashboard). The product's value is the **loop**, not any single screen.

**The moat — from answer generator to reasoning system.** Most AI tools *narrate* ("I chose Kafka because it's good for events"). ArchitectAI **proves** every decision with a traceable causal chain: *requirement → inferred constraint → selected pattern → rejected alternatives → governance rules applied → resulting contracts → downstream implications.* This **Decision Lineage** (see §6A) is the flagship differentiator — it attacks causal opacity and blind trust, and it is the **top-priority content whenever a component is selected**.

---

## 3. The core product loop (corrected model)

```
                ┌──────────────────────── WEB APP ────────────────────────┐
                │                                                          │
   (new user)   │   Landing ──► Interrogation ──► Generation ──► Workspace │
   sign in ────►│      │            (≤7 Qs)       (streaming)       │       │
                │      │                                            ▼       │
                │      │                                    ┌──► LOCK ◄──┐  │
                │      │                                    │ (status:   │  │
   (returning)  │      │                                    │  ready)    │  │
   Dashboard ◄──┼──────┘                                    └─────┬──────┘  │
      ▲         │                                                 ▼         │
      │         │                               Export to IDE Wizard (S9)   │
      │         │                          builds manifest + contracts +    │
      │         │                          rules + forbidden-patterns       │
      │         └─────────────────────────────────────┬────────────────────┘
      │                                                │ deep-link opens IDE
      │  switch back to web                            ▼   + scoped token
      │                          ┌──────────────── IDE (Cursor / VS Code) ──────────────┐
      │                          │  Workspace Setup (S6) ─► Normal/Governed (S7)         │
      └──────────────────────────┤            ▲                     │                    │
         drift synced (fast-      │            └──── Drift State (S8)◄┘  (on file save)   │
         follow) → project cards  └───────────────────────────────────────────────────────┘
```

**Step-by-step:**
1. **Sign in (upfront).** Authentication is required before doing anything. New users sign up from the public Landing page; returning users go straight to the Dashboard **if they have projects** (otherwise the Landing/create empty-state).
2. **Create (Web).** Landing hero → Interrogation (adaptive, ≤7 questions) → Generation (live SSE stream, **capturing decision lineage as it builds**) → **Architecture Workspace**. Clicking any component opens its **Decision Trace** (§6A) as the primary panel content.
3. **Lock (Web).** Generation already leaves the architecture in **`status = ready`** (which is exportable — we reuse the existing status, there is no separate "locked" state). In the Workspace the user reviews/refines, then **Locks** to finalize: Lock takes a **version snapshot** that becomes the export baseline (stamped into the manifest). Export requires `ready`; Lock decides *which version* is exported.
4. **Export / Bridge (Web → IDE).** The locked (`ready`) architecture is fed through the **Export to IDE Wizard** (Screen 9), which generates `.architectai/` artifacts (manifest, contracts, rules, forbidden-patterns) and **deep-links the user into Cursor/VS Code**. The extension then **pulls its config from the server using a scoped workspace token**.
5. **Govern (IDE).** The extension drives **Workspace Setup (S6) → Normal/Governed (S7)**, monitoring saves; on a contract violation it shows **Drift State (S8)** with auto-fix / ignore / request-exception.
6. **Monitor (IDE → Web).** Switching back to the Web app lands the user on the **Workspace Dashboard (S5)** — project cards with status. (Live drift sync from the IDE onto the cards is a **fast-follow** right after the first MVP; see §7.)
7. **Iterate (versioned).** Editing a locked architecture creates a **new version**; re-exporting pushes an `architecture.updated` event so the IDE picks up the new contracts.

---

## 4. Target users

| Persona | Today's pain | With ArchitectAI |
|---|---|---|
| **Enterprise Architect** | Handwritten ADRs, no enforcement | Define rules once; AI enforces on every architecture + flags every code deviation |
| **Staff / Principal Engineer** | 2–3 hrs in draw.io + manual specs | 30 seconds to a governed architecture with contracts + ADRs, then export to IDE |
| **Governance / Security Lead** | Quarterly reviews, no real-time view | Drift dashboard, exception workflow, SOC2-ready audit log |
| **Developer (Cursor user)** | Finds violations only at PR review | Inline IDE drift alerts at save time + one-click Accept & Apply Fix |

RBAC roles: `owner`, `architect`, `governance_lead`, `developer`, `viewer` — enforced at the API (JWT) and DB (RLS) layers with org-level isolation.

---

## 5. Product surface (9 screens) and how they connect

All nine screens are in the MVP because the loop requires them. Detailed behavior lives in `docs/01`.

| # | Screen | Surface | Role in the loop |
|---|---|---|---|
| 1 | Landing Page | Web | Public entry; hero kicks off creation (after sign-in) |
| 2 | Interrogation Flow | Web | Adaptive context gathering (≤7 Qs) |
| 3 | Architecture Generation | Web | Live streaming generation (SSE) |
| 4 | Architecture Workspace | Web | Inspect (**Decision Trace** on node click), refine, **Lock** |
| 5 | Workspace Dashboard | Web | **Return hub** — project cards, monitoring, new architecture |
| 9 | Export to IDE Wizard | Web | **Bridge** — builds `.architectai/` + deep-links to IDE |
| 6 | Cursor Workspace Setup | IDE Extension | Bind **local workspace**, pull config via scoped token |
| 7 | Cursor Normal State | IDE Extension | Governed steady-state, monitoring active |
| 8 | Cursor Drift State | IDE Extension | Violation detected → diff, auto-fix, exception |

> **Navigation truth:** Landing is the public (pre-sign-in) marketing entry — viewable without auth, but any action (generate, save, export) requires sign-in (no anonymous flow). Once authenticated, **Dashboard is home if the user has projects**. Workspace is reached from Dashboard or after generation. Export is reached from the Workspace (post-Lock). The IDE screens are reached by the export hand-off. Returning from the IDE lands on the Dashboard.

---

## 6. Non-negotiable UX rules (from `docs/00` / `docs/05 §8`)

1. **Dark mode only** — base `#090a0f`.
2. **Keyboard shortcuts render as `<kbd>`**, never plain text.
3. **Workspace right panel has NO tabs** — mode = `selectedServiceId === null ? AI Reasoning : Node Detail`.
4. **Workspace left side is a 48px icon toolbar**, not a sidebar.
5. **"Accept & Apply Fix"** (not "Apply Auto-Fix").
6. **"Ignore drift" and "Request Exception" are equal-weight bordered buttons** — never amber.
7. **Drift score always shows "deducts from governance grade"**.
8. **Cancel generation is always available.**
9. **Dashboard has two distinct card types** — `MyProjectCard` vs `TopArchCard`.
10. **Drift `/check` responds < 200ms** (fires on every save).
11. **Layer accordion items show chevrons; governance wrench icon is `size={16}`.**
12. **Anti-pattern "Clear" badges show a 3s undo toast** — irreversible micro-actions need an undo window.
13. **Answered interrogation rows have a hover-reveal edit affordance** — revising an answer must not lose later answers.

> Note: `docs/05 §8` also states "Export appears in exactly one place (header)", while `docs/01 Screen 4` and `docs/05 §3.5` describe **two** intentional locations (header + AI-Reasoning triage). This is a contradiction *in the original specs* — resolved in `new_architecture.md`/build as: header is the always-on primary; the triage-panel button is a contextual secondary shown only when issues exist and no node is selected. Flagged for product sign-off.

---

## 6A. Decision Lineage — Architecture Decision Provenance Engine (Flagship)

**Problem it solves.** Today AI reasoning is *descriptive, not traceable*. Engineers can't answer: *Why did AI choose this? Which requirement caused it? Which assumptions were inferred? Which governance rule overrode alternatives? What evidence supports it?* Without lineage, the reasoning panel is just narration — an epistemic illusion.

**What it is.** Every generated component exposes a complete, traceable **causal chain**:

```
Requirement → Inferred Constraint → Selected Pattern → Rejected Alternatives
            → Governance Rules Applied → Resulting Contracts → Downstream Implications
            (+ Assumptions, + Evidence)
```

**Worked example — user clicks "Kafka Event Bus":**

> **Chosen because**
> - PRD mentions asynchronous fraud processing *(evidence: requirement)*
> - P95 latency target exceeded the synchronous threshold *(inferred constraint)*
> - Retry semantics required *(inferred constraint)*
> - Governance rule **MQ-04** prefers Kafka > RabbitMQ above 50K TPS *(rule applied / overrode alternative)*
>
> **Alternatives considered**
> - RabbitMQ → rejected (throughput bottleneck risk)
> - SQS → rejected (ordering guarantees insufficient)
>
> **Assumptions**
> - At-least-once delivery acceptable
> - Eventual consistency permitted
>
> **Resulting contracts:** EventBus.publish/subscribe contract · **Downstream implications:** Fraud Detector, Notification Svc

### 6A.1 UX behavior (Architecture Workspace)
- **Top priority on selection.** Clicking *any* node enters **Decision Trace mode** — the trace is the **primary** content of the right panel, rendered above the existing status/issues/metadata (which are demoted to secondary sections).
- **Expandable causal chain.** Each step in the chain is clickable/expandable to reveal evidence, source (which interrogation answer / PRD span / rule / metric), and confidence.
- **Architecture Lineage Graph.** A toolbar toggle opens a full graph where nodes are *requirements, constraints, decisions/components, rules, contracts* and edges are typed causal links (`derives / selects / rejects / governs / produces / impacts / assumes`). Selecting any graph node focuses its trace.
- **Cross-navigation.** From a rejected alternative or a governance rule in the trace, the user can jump to the rule definition or to affected downstream components.

### 6A.2 What this changes/removes (intentional)
- The previous **per-layer "italic AI narration"** in the AI Reasoning panel is **demoted/replaced** by traceable lineage — it was the exact "narration without proof" this feature attacks. The **actionable urgency triage stays**.
- Node Detail is **reordered**: Decision Trace first; status banner + confidence kept compact at top; issues, metadata, and "Implement a change" move below the trace.

### 6A.3 Why it's critical (strategy)
It directly attacks **epistemic illusion, causal opacity, and blind trust**, transforming ArchitectAI from an *answer generator* into a *reasoning system*. This is the primary trust differentiator and a likely moat.

### 6A.4 What it requires (summary; detail in `new_architecture.md`)
- **Capture at generation time:** the generation model must emit, per component, links to the interrogation answers/PRD spans (requirements), inferred constraints, rejected alternatives (already in the data model), governance rules that influenced/overrode the choice, resulting contracts, and downstream implications — as **structured, validated output**, not prose.
- **New data:** a per-architecture **lineage graph** (typed nodes + causal edges) and a per-component **Decision Trace** (spec deltas **D3–D6** in `new_architecture.md §10.1`).
- **New API:** `GET /architectures/{id}/lineage` and `GET /architectures/{id}/services/{serviceId}/trace`.

---

## 7. Scope strategy — Full loop, lean infrastructure

The **first shippable MVP is the entire loop** (§3). We do **not** cut the Export Wizard or the Cursor extension — those are the product. What we keep lean is **infrastructure and enterprise-grade operations**, not features. (Detailed tiers: `new_architecture.md §3.6, §11, §12`.)

### 7.1 Confirmed product decisions (v2.0)

| Decision | Choice |
|---|---|
| MVP scope | **The full loop** — all 9 screens + the Cursor extension + **Decision Lineage (§6A)** as the flagship workspace capability |
| "Locked" architecture | **Reuse `ready` status** (no new lifecycle state); export requires `ready` |
| Web → IDE hand-off | **Deep-link** opens Cursor/VS Code; extension **pulls config via scoped workspace token** |
| Repository link | **Local workspace path** at MVP (GitHub integration deferred) |
| Returning-user home | **Dashboard if projects exist**, else Landing/empty-state |
| Authentication | **Required upfront** — no anonymous flow |
| Drift → Dashboard sync | **Fast-follow** (drift works in the IDE at MVP; live dashboard aggregation comes right after) |
| Post-lock edits | **Versioned** — re-export pushes `architecture.updated` to the IDE |

### 7.2 What "production-grade" means even in the lean MVP
No quality cuts: multi-tenant isolation (RLS), structured-output validation, audit logging, backups, the **top-tier LLM for generation**, and the two latency budgets (**generation < 30s**, **drift < 200ms**) all hold from day one.

### 7.3 Deferred to scale-up (config, not rewrites)
High-availability (Multi-AZ, multiple replicas), multi-region (EU/GDPR), enterprise SSO/SAML, premium APM, GitHub integration, live drift→dashboard sync polish, and formal SOC2 Type II **certification** (controls built early; audit later).

### 7.4 Cost posture
- **Pay for:** LLM API usage (only unavoidable cost) + small free/cheap SaaS (Clerk, Sentry, Resend).
- **Fixed infra:** ~$0–50/mo (Neon/Supabase Postgres, Upstash Redis, Render/Fly hosting).
- **LLM levers (quality-preserving):** top-tier model for generation only; cheaper model for interrogation/chat/drift enrichment; **deterministic, LLM-free drift hot path**; prompt caching; RAG grounding; per-org token budgets.

---

## 8. Technology decisions (summary)

Full detail in `new_architecture.md §3–§4`.

- **Language:** **All TypeScript** (chosen "Option B") — one language across web, API, workers, and the Cursor extension (the extension *must* be TS regardless); a single shared types package; no translation of the TS-shaped specs.
- **Frontend:** React 18 + Vite + Tailwind + TanStack Query + Zustand + React Flow + React Router + Clerk.
- **Backend:** Node 22 + Express 5 + Drizzle + PostgreSQL 16 + Zod; Redis + BullMQ; SSE (generation) + WebSocket (drift/`architecture.updated`); OpenAPI 3.1 contract.
- **Extension:** TypeScript VS Code extension + React webviews; deep-link activation + scoped-token config pull.
- **Drift engine:** deterministic static analysis (AST + import graph + rule matcher) on the < 200ms hot path — **no LLM**; LLM enrichment async over WebSocket.
- **AI / models:** provider-agnostic **LLM Gateway** — **Opus-class (Claude) for generation**, **Sonnet-class for interrogation/chat/drift enrichment**, **embeddings + pgvector** for RAG.

---

## 9. Success metrics

| Metric | Target |
|---|---|
| Time from signup to first architecture | < 5 minutes |
| Architecture generation time | < 30 seconds (P95) |
| Drift detection latency (save → response) | < 200 ms (P95) |
| Drift alert latency (save → alert) | < 500 ms |
| **Loop completion rate** (create → lock → export → IDE active) | track as primary activation metric |
| **Decision-lineage completeness** (components with a full, evidence-backed trace) | 100% of generated components |
| **Decision-trace engagement** (sessions that open ≥1 trace / lineage graph) | track as trust signal |
| Drift auto-fix acceptance rate | > 60% |
| Daily active usage (returning) | > 3 sessions/week |
| NPS (enterprise) | > 50 |

For the MVP, the **primary signal is loop completion + qualitative feedback**: did users go all the way from a pasted requirement to an active, governed workspace in their IDE?

---

## 10. Cross-cutting requirements

- **Auth & RBAC:** Clerk (upfront sign-in; SSO/SAML at scale-up); route checks + RLS; org isolation. The IDE extension authenticates with a **scoped workspace token** (not the user JWT).
- **Real-time:** SSE generation stream; WebSocket drift push + `architecture.updated` (re-export); Dashboard polling for status.
- **Governance engine:** rule-defined (boundary, auth, pattern, naming, contract, dependency) evaluated at generation time (Web), code time (IDE save), and CI (future).
- **Export artifacts:** `.architectai/{manifest,rules,boundaries,forbidden-patterns}.json` + service contracts; delivered by deep-link + token pull (downloadable fallback acceptable).
- **Versioning:** locking/editing bumps `architecture.version`; re-export notifies connected workspaces.
- **Audit log:** immutable, append-only, partitioned per org; exportable for SOC2.

---

## 11. Out of scope (for now)

- GitHub repo integration (local workspace path only at MVP).
- Live drift→dashboard aggregation polish (fast-follow).
- Multi-region/HA, enterprise SSO/SAML, SOC2 certification (scale-up).
- IDEs beyond Cursor/VS Code (JetBrains/Neovim via LSP — future).
- Full secondary dashboard nav destinations (AI Insights, Templates gallery, Team, Integrations, Settings) — these ship as **minimal stubs** in the MVP; Workspace, Governance, Drift Center, and Audit are the functional destinations.
- Terraform & Pulumi (IaC) export formats — **cursor-config, OpenAPI, and ADR-markdown are in the MVP**; Terraform/Pulumi are added when requested.

---

## 12. Open questions to revisit after feedback

1. Does the deep-link hand-off feel seamless, or do users need the downloadable-files fallback more often than expected?
2. Is local-path workspace binding sufficient, or is GitHub integration the top early ask?
3. How important is live drift-on-dashboard vs. drift-in-IDE-only for early users?
4. Is the 7-question interrogation the right depth?
5. What LLM cost-per-architecture is acceptable, and where should per-org budgets default?

---

*Screen-level pixel specs, data shapes, and API contracts are not duplicated here — they live in `docs/01–05` and remain the detailed source of truth.*
