# ArchitectAI — Product Requirements (PRD v3.0)

**Version:** 3.0
**Date:** 2026-05-31
**Status:** Active — repositions the product around **independent verification**; supersedes v2.0's framing while preserving its loop, tech, and subsystems
**Owner:** Product
**Related documents:**
- `new_PRD.md` (v2.0) — the loop, screens, scope decisions this version builds on
- `new_architecture.md` (v2.0) — system topology, tech/model strategy, Decision Provenance Engine, drift engine
- `docs/01–05` — screen specs, data model, DB schema, API spec, frontend spec (remain detailed source of truth)
- `IMPLEMENTATION_PLAN.md` — phased build plan

> **What changed in v3.0 (the one thing that matters).** v2.0 modeled ArchitectAI as an *AI architecture generator wrapped in a governance loop*, with **Decision Lineage** (provenance) as the flagship. Strategy work since then identified that lineage proves *traceability*, not *correctness* — the "**provenance ≠ correctness**" gap. v3.0 closes that gap by making **independent verification against ground truth** the soul of the product. A new first-class subsystem — **the Verification Pass** — sits between *Generate* and *Lock*, adjudicates every architectural decision against concrete ground truth using an engine **independent of the generator**, and **gates the consequential action** (Lock/Export). Decision Lineage becomes the *explainability half* ("why the AI chose this"); the Verification Pass is the *correctness half* ("…and whether it holds, checked against what"). The drift engine becomes the *continuous* half ("…and is it still true in the code?"). Generation is now an *application* of the platform, not the headline. **The loop, screens, tech stack, lineage engine, and drift engine from v2.0 are preserved and reused** — v3.0 is additive.

---

## 1. Product vision (repositioned)

ArchitectAI is an **independent verification layer for AI-generated engineering decisions** — it checks each decision against concrete ground truth and **explains the verdict spatially, on the architecture itself.**

**Core promise:** *Every AI architectural decision arrives with an independent verdict — verified, unverified, or in conflict — checked against your requirements, your rules, and known-good ground truth, and shown right on the diagram. You see exactly where to trust the AI and where to look closer, before you ship.*

**The problem we solve** (from the Problem Framing Canvas, sharpened to our domain): *senior engineers and architects must decide whether to trust AI-generated engineering decisions, but there is no independent, faithful verification between an AI's output and the consequential action of shipping it — so they verify manually or trust blindly.* ArchitectAI is that missing layer.

**The wedge.** AI now generates architectures and code faster than humans can verify them. The bottleneck has moved from *creating* to *trusting*. ArchitectAI makes trust a **system output, not a manual chore**: an independent verdict at the moment of the decision, gating the action, explained on the canvas.

**The moat — three compounding layers.**
1. **An independent verification engine** (separate from the generating model — it never grades its own homework).
2. **A ground-truth corpus** of validated reference patterns plus every verdict, acceptance, and override the platform records — a data flywheel that sharpens the verifier over time and that a single-model vendor cannot replicate.
3. **Spatial explanation** — the verdict projected onto the architecture visualization, the one trust UX no competitor offers (everyone else ships lists and dashboards).

**The three halves of trust, as one chain.** *Provenance* (Decision Lineage — why) + *Correctness* (Verification Pass — whether, against ground truth) + *Continuity* (Drift Engine — still true in the code). Together they verify an unbroken chain: **requirements → independently-verified architecture → conformant code.**

---

## 2. Target users & personas

| Persona | Role in the loop | Today's pain | With ArchitectAI v3.0 |
|---|---|---|---|
| **Staff / Principal Engineer** (primary user, "the decider") | Generates, **verifies**, locks, exports | Trusts AI design on fluency; finds problems at PR or in prod | An independent verdict per decision *before* lock; sees where to trust and where to scrutinize |
| **Enterprise Architect** (primary user) | Defines rules; owns architecture integrity | ADRs rot; no enforcement; can't prove design soundness | Rules become ground truth; every decision verified against them and shown on the canvas |
| **Governance / Security Lead** (economic buyer) | Reviews verdicts, overrides, audit | Quarterly reviews; no real-time trust view | A Trust Grade per system, an override log, SOC2-ready evidence of *independent* verification |
| **Developer (Cursor/VS Code)** | Codes against a **verified** baseline | Violations found only at PR review | Inline drift alerts at save against an architecture that was *independently verified*, not just generated |
| **Regulated professional** (future segment — finance/legal/clinical) | Signs off on AI-assisted work | No defensible, independent proof of correctness | The same engine, applied to regulated work products (post-MVP) |

RBAC roles unchanged from v2.0: `owner`, `architect`, `governance_lead`, `developer`, `viewer` — enforced at API (JWT) + DB (RLS), org-isolated.

---

## 3. The core product loop (revised — verification-gated)

```
                ┌──────────────────────────── WEB APP ───────────────────────────────┐
                │                                                                     │
   sign in ────►│ Landing ─► Interrogation ─► Generation ─► ★VERIFICATION PASS★ ─► Workspace
                │            (≤7 Qs)          (Opus+lineage)  (independent engine)    │  (lineage
                │                                              verdict per decision)  │   + verdict)
                │                                                       │             │     │
                │                                                       ▼             │     ▼
                │                                          ┌──────► LOCK ◄──────┐     │  refine
                │                                          │  GATED: blocked    │     │
                │                                          │  unless verified   │◄────┘
                │                                          │  or override+reason │
                │                                          └─────────┬──────────┘
                │                                                    ▼
                │                          Export Wizard (S9) — stamps verification run + Trust Grade
                └──────────────────────────────────────────────────┬──────────────────┘
                                                                    │ deep-link + scoped token
   Dashboard ◄──── Trust Grade (verification − drift) ◄──── IDE (Cursor/VS Code): code conforms
   (return hub)        per project card                          to the VERIFIED baseline; drift on save
```

**Step-by-step (changes from v2.0 in bold):**
1. **Sign in** (upfront; unchanged).
2. **Create** — Landing → Interrogation (≤7 Qs) → Generation (Opus, SSE, capturing lineage). Unchanged, except generation output now flows into the Verification Pass.
3. **★ Verify (new)** — an **independent Verification Pass** adjudicates every decision against ground truth (§7B). Deterministic findings resolve in <2s; probabilistic findings stream in. Each component receives a verdict: **✅ verified / ⚠️ unverified / ❌ conflict**.
4. **Inspect** — in the Workspace, clicking a node shows **Decision Lineage** (why) *stacked above* **Verification** (whether — the findings, ground-truth sources, and confidence). The canvas is color-coded by verdict.
5. **Lock (now gated)** — Lock is **blocked** if any component above a criticality threshold has an unresolved **deterministic ❌ conflict**, unless the user records an **override-with-reason** (logged to audit). Probabilistic ⚠️ flags are advisory and never block. Lock snapshots the `version` and the verification run as the export baseline.
6. **Export / Bridge** — unchanged mechanism (deep-link + scoped token), but the `manifest.json` now **stamps the verification run id, the Trust Grade, and any overrides.**
7. **Govern (IDE)** — unchanged drift engine; it now enforces code against an **independently-verified** baseline, closing the chain.
8. **Monitor** — Dashboard cards show a **Trust Grade = verification status − open drift** (live drift→grade aggregation is fast-follow, per v2.0).
9. **Iterate** — editing a locked architecture bumps `version` and **re-runs the Verification Pass**; re-export pushes `architecture.updated`.

---

## 4. Product surface (screens)

v3.0 **adds no standalone screens** — it elevates verification *inside* the existing surfaces (this keeps the build lean and the loop intact).

| # | Screen | Surface | v3.0 change |
|---|---|---|---|
| 1 | Landing | Web | Repositioned copy: "independent verification," not "30-second generation" |
| 2 | Interrogation | Web | Unchanged (its answers become `requirement` ground-truth nodes) |
| 3 | Generation | Web | After node stream, transitions into the **Verification Pass view** (streams findings) |
| 4 | **Workspace** | Web | Node panel: **Lineage (why) above Verification (whether)**; canvas **color-coded by verdict**; Lineage Graph gains a **Verification overlay**; header shows **Trust Grade** |
| — | **Lock gate** | Web (modal) | New: blocks on unresolved deterministic conflicts; **override-with-reason** flow |
| 5 | Dashboard | Web | Cards show **Trust Grade**; verification status + drift |
| 9 | Export Wizard | Web | Manifest stamps **verification run + Trust Grade + overrides** |
| 6–8 | Cursor Setup / Normal / Drift | IDE | Unchanged drift engine; "Governed" state now reads "Verified baseline · governed" |

---

## 5. Non-negotiable UX rules

All v2.0 rules hold (dark-only `#090a0f`, `<kbd>` shortcuts, no right-panel tabs, 48px toolbar, "Accept & Apply Fix", equal-weight Ignore/Request-Exception, always-cancellable generation, two dashboard card types, drift `/check` < 200ms, etc.). **New v3.0 rules:**

14. **Deterministic and probabilistic verdicts are visually distinct.** Deterministic findings render as a hard **✅ / ❌** ("proven"); probabilistic findings render as **~confidence** with an explicit *"signal, not proof"* label. They must never look the same.
15. **A probabilistic finding never blocks Lock and is never shown as fact.** Only deterministic conflicts gate; only deterministic checks earn an unqualified ✓.
16. **Ungrounded provenance is flagged, never rendered as fact** (carries forward v2.0's referential-integrity guard).
17. **Override requires a typed reason** and is irreversible without a new edit; it writes an immutable audit event.
18. **Trust Grade always shows its breakdown** (verification deductions vs open-drift deductions) on hover/expand — never a bare number.
19. **Conflicts use ❌ (red), not amber.** Amber is reserved for "unverified/uncertain," consistent with the existing no-amber-for-actions rule.

---

## 6. Flagship subsystem A — Decision Lineage (provenance — "why")

*Carried forward from v2.0 §6A / Decision Provenance Engine, unchanged in mechanics; re-scoped as the explainability half of trust.*

Every generated component exposes a structured, schema-validated causal chain — *requirement → inferred constraint → selected pattern → rejected alternatives → governance rules → resulting contracts → downstream implications (+assumptions, +evidence)* — captured at generation time as typed nodes/edges, persisted, and queryable. Server-side **referential integrity** ensures every `source.ref` resolves to a real interrogation answer / PRD span / rule; unresolved provenance is flagged, never shown as fact. **Lineage answers *why* the AI chose something. It is necessary but not sufficient — it does not establish *correctness*. That is the Verification Pass's job.**

---

## 7. Flagship subsystem B — The Verification Pass (correctness — "whether") ★ NEW

The Verification Pass is the v3.0 flagship: an **independent** adjudication of every architectural decision against **concrete ground truth**, run after generation and **gating Lock/Export**.

### 7B.1 First principle — independence
**The verifier is a different engine than the generator, by construction.** The generation model (Opus-class) produces the architecture + lineage; it **never verifies its own output.** Verification is performed by (a) a deterministic, LLM-free engine, and (b) for probabilistic checks, a **different model family** routed through the LLM Gateway. This is what makes it *independent verification* rather than the self-verification paradox in nicer packaging.

### 7B.2 Tier 1 — Deterministic checks (the spine; render as ✅/❌, "proven")
Reuse the existing static-analysis/rule engine and the lineage graph; **no generating-model involvement.**

| Check id | Verifies | Ground truth | Reuses |
|---|---|---|---|
| `coverage.requirement` | Every requirement maps to ≥1 component | The interrogation/PRD requirement set | Lineage graph |
| `coverage.justification` | Every component traces to ≥1 requirement (no "invented" components) | The requirement set | Lineage graph |
| `structure.composition` | Service contracts compose; required interfaces present | Architecture well-formedness rules | Graph engine |
| `structure.integrity` | No dependency cycles, orphan services, or dangling references | Graph well-formedness | Graph engine + import matcher |
| `governance.conformance` | The generated architecture satisfies the org ruleset | The active governance ruleset | **Existing rule matcher**, run at generation time on the architecture graph |
| `constraint.satisfiability` | Each inferred constraint (e.g., ">50K TPS", "P95<X") is satisfiable by the chosen pattern | A curated **capability reference table** | New (small) reference table |

### 7B.3 Tier 2 — Independent probabilistic checks (the differentiator; render as ~confidence, "signal not proof")

| Check id | Verifies | Ground truth | Reuses |
|---|---|---|---|
| `adjudication.crossmodel` | An independent model family agrees with the decision given the constraints (agree / disagree / "would choose X because Y") | A genuinely independent second opinion | LLM Gateway (route to a non-generator model) |
| `pattern.reference` | The decision matches a validated known-good pattern for this constraint profile | A curated **reference-architecture corpus** | **Existing pgvector RAG** |

> Cross-model agreement is a **confidence signal, not a guarantee** — two models can share a blind spot. The UI must say so. Reference-pattern match returns nearest validated pattern + similarity; it informs, it does not gate.

### 7B.4 Verdict model
- **Per finding:** `verified` (deterministic check passed) · `conflict` (deterministic check failed) · `unverified` (check couldn't be grounded, or a probabilistic check flagged disagreement/low match). Each finding carries `tier`, `confidence`, `ground_truth_source`, `detail`, and an `evidence_ref`.
- **Per component:** rolled up — `conflict` if any deterministic conflict; else `unverified` if any open probabilistic flag or ungrounded check; else `verified`.
- **Per architecture → Trust Grade** (§7D).

### 7B.5 The gate (this is what makes verification *consequential*)
- **Lock is blocked** when any component with `criticality ≥ threshold` has an unresolved **deterministic `conflict`**, unless an **override-with-reason** is recorded for it (immutable audit event; surfaced in the Trust Grade breakdown).
- **Probabilistic flags never block** — they are surfaced and tracked as advisory.
- **Export requires `ready` + a completed verification run**; the run id, Trust Grade, and overrides are stamped into `manifest.json`.

### 7B.6 The spatial explanation (your differentiated UX)
- **Canvas:** every node color-coded by rolled-up verdict (✅/⚠️/❌).
- **Node panel:** **Decision Lineage** (why) stacked *above* **Verification** (whether) — a list of findings, each expandable to its check, verdict, ground-truth source, confidence, and evidence.
- **Lineage Graph → Verification overlay:** a toggle that adds `ground-truth-source` nodes and typed `verifies` / `contradicts` edges from decisions to the evidence that confirms or conflicts with them.

### 7B.7 The data flywheel (the moat)
Every finding, acceptance, and override is captured (org-scoped, RLS). This (a) builds the **reference-pattern corpus**, (b) calibrates the probabilistic checks, and (c) yields a proprietary record of *what good looks like* and *what humans accept/reject*. Cross-org aggregate learning is **opt-in** and de-identified.

### 7B.8 Honesty controls (the trust differentiator)
- Deterministic vs probabilistic verdicts visually and semantically distinct (Rule 14).
- No probabilistic verdict shown as fact or used to gate (Rule 15).
- Ungrounded provenance flagged (Rule 16).
- The Verification Pass publishes its **own reliability** (precision of each deterministic check on the eval set) — the verifier is itself measured.

---

## 8. Flagship subsystem C — Drift Engine (continuity — "still true?")

*Carried forward unchanged from v2.0 (deterministic AST + import-graph + rule matcher, P95 < 200ms, no LLM on the hot path; async LLM enrichment over WebSocket).* Re-scoped as the **continuous** half of one verification chain: the IDE now enforces code against an **independently-verified** architecture baseline, and open drift **feeds the Trust Grade**.

---

## 9. Trust Grade (unifying metric) ★ NEW

A single per-architecture score that unifies the two halves and is the product's primary trust signal.

- **Generation-time component:** starts at 100; deduct for deterministic conflicts (heavy), unverified-critical components (medium), and open probabilistic flags (light, capped). Overrides are recorded but shown transparently in the breakdown.
- **Code-time component:** open drift penalties (reuses the existing `sync_architecture_drift_score()` trigger) deduct further once drift→grade aggregation lands (fast-follow).
- **Always shows its breakdown** (Rule 18). Tuning of weights is an open question (§16).

---

## 10. Functional requirements

**Generation & lineage (existing, confirmed):**
- FR-1 Generation streams Zod-validated `node | governance | lineage | progress | complete` events via SSE; lineage captured per component with referential integrity.

**Verification Pass (new core):**
- FR-2 On `complete`, the system **automatically triggers a Verification Pass** for the architecture version.
- FR-3 The Verification Pass runs **all Tier-1 deterministic checks** (§7B.2) with **no generating-model involvement**; P95 deterministic verdict **< 2s**.
- FR-4 The Verification Pass runs **Tier-2 probabilistic checks** (§7B.3) asynchronously, streaming findings as they resolve; full pass P95 **< 20s** (does not block viewing).
- FR-5 Each finding persists with `tier`, `verdict`, `confidence`, `ground_truth_source`, `detail`, `evidence_ref`, and binds to a `service_id`/lineage node.
- FR-6 The Workspace **projects verdicts onto the canvas** (color-coded) and renders **Verification beneath Lineage** in the node panel (Rule order).
- FR-7 The Lineage Graph provides a **Verification overlay** (ground-truth nodes + `verifies`/`contradicts` edges).
- FR-8 **Lock is gated** per §7B.5: blocked on unresolved deterministic conflicts on critical components absent an override-with-reason.
- FR-9 **Override-with-reason** writes an immutable audit event and is shown in the Trust Grade breakdown.
- FR-10 **Export** requires a completed verification run and **stamps run id + Trust Grade + overrides** into `manifest.json`.
- FR-11 Editing a locked architecture **re-runs the Verification Pass** on the new version.
- FR-12 The system computes and displays the **Trust Grade** with a breakdown (verification vs drift).
- FR-13 The Verification Pass exposes its **own measured reliability** (per-check precision) in an info affordance.

**Drift (existing, confirmed):**
- FR-14 `POST /drift/check` deterministic, P95 < 200ms; async LLM enrichment over WS; lifecycle `apply-fix | ignore | exception`. Open drift feeds Trust Grade (fast-follow).

---

## 11. Data model additions (sibling to the lineage tables; architecture-scoped, RLS)

```ts
type VerificationTier   = "deterministic" | "probabilistic";
type VerificationVerdict = "verified" | "unverified" | "conflict";
type VerificationCheck =
  | "coverage.requirement" | "coverage.justification"
  | "structure.composition" | "structure.integrity"
  | "governance.conformance" | "constraint.satisfiability"
  | "adjudication.crossmodel" | "pattern.reference";

interface VerificationRun {
  id: string; architectureId: string; version: number;
  status: "running" | "complete"; trustGrade: number;
  engineVersions: Record<string, string>;  // verifier provenance
  startedAt: string; finishedAt?: string;
}
interface VerificationFinding {
  id: string; runId: string; architectureId: string;
  serviceId?: string; lineageNodeId?: string;
  check: VerificationCheck; tier: VerificationTier;
  verdict: VerificationVerdict; confidence: number;     // 1.0 for deterministic
  groundTruthSource: { kind: "requirement" | "rule" | "capability-table" | "reference-corpus" | "cross-model"; ref: string };
  detail: string; evidenceRef?: string;
}
interface VerificationOverride {
  id: string; findingId: string; architectureId: string;
  userId: string; reason: string; createdAt: string;     // immutable, audited
}
```

- Tables: `verification_runs`, `verification_findings`, `verification_overrides`; plus a `reference_patterns` pgvector table for `pattern.reference`. All under the **same RLS policy** as `architectures`.
- Audit: new `architecture.verified` and `architecture.override_recorded` event types (additive to `AuditEventType`).

---

## 12. API additions (Architectures + new Verification tag; OpenAPI 3.1, runtime-validated)

- `POST /architectures/{id}/verify` → `202 { runId, streamUrl }` (triggers a pass; idempotent per version).
- `GET  /architectures/{id}/verification` → latest `VerificationRun` + findings (+ Trust Grade).
- `GET  /architectures/{id}/services/{serviceId}/verification` → per-component findings.
- `POST /architectures/{id}/findings/{findingId}/override` `{ reason }` → records override (role: `architect`/`governance_lead`).
- `POST /architectures/{id}/lock` → **gated**: 409 with unresolved-conflict list if the gate fails.
- SSE/WS `verification` events stream findings as they resolve (sibling to the `lineage` event).

---

## 13. Non-functional requirements

| Metric | Target | How |
|---|---|---|
| Generation (end-to-end) | P95 < 30s | Streamed, RAG-grounded (unchanged) |
| **Verification — deterministic verdict** | **P95 < 2s** | LLM-free engine on the lineage/rule graph |
| **Verification — full pass (incl. cross-model + RAG)** | **P95 < 20s, streamed** | Async; never blocks viewing; gate evaluates on deterministic tier |
| Drift check (save→response) | P95 < 200ms | Deterministic engine (unchanged) |
| Verifier reliability (per deterministic check) | **published, precision ≥ 0.98 target** | CI eval goldens; false positives are the cardinal sin |
| Loop completion (create→verify→lock→IDE active) | primary activation metric | — |

Independence, multi-tenant RLS, structured-output validation, immutable audit, and the LLM-free deterministic paths all hold from day one (carried from v2.0).

---

## 14. Scope strategy — verification ships in tiers (lean MVP, full loop)

The loop stays intact (v2.0 decision), but **verification ships in tiers so the MVP stays small enough to learn fast** — directly addressing the "MVP = entire loop is too big" risk.

**MVP (verification v1):**
- Tier-1 deterministic: `coverage.*`, `structure.*`, `governance.conformance`.
- Tier-2: `adjudication.crossmodel` (cheap, high-signal, genuinely independent).
- Canvas verdict projection + Lineage/Verification stacked panel + **Lock gate** + **Trust Grade v1** (verification-only).
- **Validation question:** do architects/governance leads say *"this is the first time I can see where to trust the AI's design and where I can't"*?

**Fast-follow:** `constraint.satisfiability` (+ capability table) · `pattern.reference` (+ reference corpus, RAG) · Verification overlay on the Lineage Graph · drift→Trust-Grade live aggregation · cross-org corpus flywheel.

**Scale-up (config, not rewrite):** HA/multi-region, SSO/SAML, GitHub App, SOC2 Type II certification, premium APM — unchanged from v2.0.

**Cost posture (unchanged):** ~$0–50/mo fixed infra + LLM usage. Verification adds one extra (cheaper, non-generator) model call per pass for cross-model adjudication; deterministic checks are $0 tokens.

---

## 15. Technology decisions

Unchanged stack (all-TypeScript monorepo; React 18 + React Flow; Node 22 + Express 5 + Drizzle + Postgres 16 + pgvector; Redis + BullMQ; SSE + WS; Clerk + RLS; provider-agnostic **LLM Gateway**; deterministic static-analysis engine). **New, all reusing existing primitives:**
- Verification engine = the **existing rule/graph matchers** applied to the architecture graph + lineage (generation-time evaluation, which the architecture already anticipates).
- Cross-model adjudication = **LLM Gateway** routed to a **non-generator** model family.
- Reference-pattern match = **existing pgvector RAG** over a curated corpus.
- Verdict store = new tables under existing RLS + audit.

---

## 16. Success metrics (verification-centric)

| Metric | Target |
|---|---|
| **Verification coverage** (components with a complete verdict) | 100% before Lock |
| **Verifier precision** (deterministic checks, on eval goldens) | ≥ 0.98 (false positives erode the trust we sell) |
| **Conflict-catch rate** (seeded faulty architectures flagged) | track; primary efficacy metric |
| **Gate effectiveness** (locks blocked / overridden / clean) | track distribution |
| **Override discipline** (overrides with a substantive reason) | qualitative review |
| **"Trust legibility"** (sessions opening ≥1 verification finding) | primary trust-engagement signal |
| Time signup → first verified architecture | < 5 min |
| Loop completion (create → verify → lock → IDE active) | primary activation metric |
| Trust Grade adoption (cards viewed; grade referenced) | track |
| NPS (enterprise) | > 50 |

---

## 17. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Provenance mistaken for correctness** (the gap this version closes) | Verification Pass adds independent ground-truth checks; lineage and verdict are visually separate halves |
| **Verifier false positives** (cries wolf → destroys trust) | Deterministic-only gating; published per-check precision ≥ 0.98; eval goldens block regressions |
| **Probabilistic verdict looks like proof** | Rules 14–15: distinct rendering, never gates, "signal not proof," ungrounded findings flagged |
| **Architecture-decision correctness is partly contextual** | Lead with deterministic checks where ground truth is concrete; probabilistic tier is advisory and confidence-scored |
| **Cross-model shared blind spots** | Framed as a signal, multiple independent families, human override path |
| **Reference corpus takes curation effort (the moat is work)** | Seed with public well-architected patterns; grow via the opt-in flywheel |
| **Scope creep back to "full loop at once"** | Verification ships in tiers (§14); MVP = deterministic + cross-model + gate |
| **Generator self-verification (independence violation)** | Hard architectural rule: verifier ≠ generator; enforced in the gateway routing + reviewed in design |
| Fabricated provenance (carried from v2.0) | Server-side referential-integrity check; unresolved refs flagged, never shown as fact |

---

## 18. Out of scope (for now)

- Verifying arbitrary AI outputs beyond architecture/engineering decisions (regulated work products = future segment).
- Formal/mathematical verification of code behavior (beyond deterministic structural/rule checks).
- GitHub repo integration, multi-region/HA/SSO, SOC2 certification, JetBrains/Neovim, Terraform/Pulumi export (all unchanged from v2.0).
- Cross-org corpus learning before explicit opt-in.

---

## 19. Open questions

1. **Trust Grade weighting** — how heavily should deterministic conflicts vs unverified-critical vs probabilistic flags deduct? Tune with early users.
2. **Criticality threshold for the gate** — what component criticality should hard-block Lock vs warn?
3. **Cross-model adjudication cost/latency** — which non-generator family, and is one enough for MVP signal?
4. **Reference corpus seeding** — start from public well-architected patterns, or require a few customer architectures first?
5. **Override governance** — should some conflict classes be non-overridable (hard fail) in regulated configurations?
6. Does the spatial verdict projection read as clearly as we expect, or do users want a ranked list view alongside it?

---

*v3.0 is additive to v2.0: the loop, screens, tech stack, Decision Lineage engine, and Drift Engine are preserved. The new Verification Pass, Lock gate, verdict data model, Verification API, and Trust Grade are the build delta. Screen-level specs, data shapes, and API contracts remain detailed in `docs/01–05`; this PRD is the authoritative product framing and the source of truth for the verification repositioning.*