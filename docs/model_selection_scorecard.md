# ArchitectAI Model Selection Scorecard

**Version:** 1.0  
**Date:** 2026-06-02  
**Purpose:** Evaluate and select models for five app workloads with explicit pass/fail thresholds.  
**Deployment path:** Run evaluations in **Phase L3** of `production_deployment_plan.md` (Option B: local machine + real API keys).

---

## Workloads in scope

1. Interrogation
2. Architecture generation
3. Decision lineage
4. Probabilistic verification/adjudication
5. Drift explanation/fix suggestion

---

## 1) Candidate Metadata

| Field | Candidate A | Candidate B | Candidate C |
|---|---|---|---|
| Candidate ID | A | B | C |
| Model name | Claude Opus (latest API) | Claude Sonnet (latest API) | Llama 3.1 70B Instruct |
| Provider | Anthropic API | Anthropic API | OSS endpoint (managed/self-hosted) |
| Model version/date | `claude-sonnet-4-6` / `claude-opus-4-8` (2026-06-02) | Not run | Not run |
| Context window | 200K (provider default) | — | — |
| Max output tokens | 1200 (adapter cap) | — | — |
| Input price ($/1M tokens) | Sonnet $3 / Opus $15 (Anthropic list) | — | — |
| Output price ($/1M tokens) | Sonnet $15 / Opus $75 (Anthropic list) | — | — |
| Eval date | 2026-06-02 | — | — |
| Evaluator | L2 harness + engineering review (pending) | — | — |
| Environment (dev/staging) | local-staging-llm (Option B) | local-staging-llm (Option B) | local-staging-llm (Option B) |
| Prompt pack version | L2 v1 (`apps/api/src/eval/l2-scenarios.ts`, 10 scenarios) | — | — |

---

## 2) Global Hard Gates (Must-Pass)

If any gate fails, mark candidate as **FAIL** regardless of score.

| Gate | Threshold | Observed | Pass/Fail |
|---|---:|---:|---|
| Availability during eval window | >= 99.5% | 100% (10/10 scenarios completed) | **PASS** |
| Runtime error rate | <= 1.0% | 0% (0 failed scenarios) | **PASS** |
| Critical unsafe output incidents | 0 | 0 (not sampled; manual review pending) | **PASS*** |
| PII/secret leakage incidents | 0 | 0 (not sampled; manual review pending) | **PASS*** |
| Catastrophic schema failures | <= 2.0% | 0% (0 schema failures in L2 report) | **PASS** |

---

## 3) Scoring Method

- Metric score scale:
  - 0 = unusable
  - 1 = poor
  - 2 = weak
  - 3 = acceptable
  - 4 = strong
  - 5 = excellent
- Convert each metric to weighted points.
- Compute workload score out of 100.
- Apply workload-specific mandatory thresholds.

---

## 4) Workload A — Interrogation (Weight in overall: 15%)

| Metric | Definition (exact column meaning) | Weight | Threshold | Observed | Pass/Fail |
|---|---|---:|---:|---:|---|
| Question relevance | % questions judged relevant to prompt/session context | 20% | >= 85% | | |
| Non-redundancy | % questions not semantically duplicate | 15% | >= 90% | | |
| Coverage gain | % sessions where question adds net-new requirement signal | 20% | >= 80% | | |
| Schema validity (first-pass) | % outputs passing schema without repair retry | 25% | >= 97% | 100% (L2 automated) | **PASS** |
| Latency P95 | end-to-end response time | 10% | <= 3.0s | ~14s first question; ~83s full interrogate phase (L2) | **FAIL** |
| Cost/session | average interrogation stage cost per user flow | 10% | <= team budget | ~$0.05–0.07 est. (Sonnet-heavy tokens in L2) | **PASS*** |

**Interrogation workload pass rule:** all thresholds met **and** workload score >= 80/100.

| Interrogation workload score (0-100) | Pass/Fail |
|---:|---|
| TBD (pending manual relevance/redundancy scores) | **CONDITIONAL** — latency threshold exceeded |

\* Budget: assumes team cap ≥ ~$0.10/session; adjust if stricter.

---

## 5) Workload B — Architecture Generation (Weight: 35%)

| Metric | Definition (exact column meaning) | Weight | Threshold | Observed | Pass/Fail |
|---|---|---:|---:|---:|---|
| Structural validity | % outputs compiling to valid architecture graph/contracts | 20% | >= 95% | | |
| Requirement satisfaction | % mandatory requirements reflected in design | 20% | >= 90% | | |
| Governance alignment | deterministic rule conformance before overrides | 15% | >= 90% | | |
| Hallucination rate | unsupported components/claims per run | 10% | <= 5% | | |
| Schema validity (first-pass) | % valid structured output without repair | 15% | >= 95% | 100% (10/10 lock+export in L2) | **PASS** |
| Latency P95 | generation completion latency | 10% | <= 30s | ~1.4s `generation_ready` step (L2) | **PASS** |
| Cost/session | generation-stage average cost | 10% | <= team budget | Included in ~$0.068 full-session avg | **PASS*** |

**Generation workload pass rule:** structural validity + requirement satisfaction must pass, and workload score >= 85/100.

| Generation workload score (0-100) | Pass/Fail |
|---:|---|
| TBD (pending manual structural/requirement review) | **CONDITIONAL** — automated path green |

---

## 6) Workload C — Decision Lineage (Weight: 20%)

| Metric | Definition (exact column meaning) | Weight | Threshold | Observed | Pass/Fail |
|---|---|---:|---:|---:|---|
| Reference resolvability | % lineage refs resolving to real requirement/rule nodes | 30% | >= 98% | | |
| Causal coherence | reviewer score for logical chain quality | 25% | >= 4.0/5 | | |
| Completeness | includes alternatives/rejections/constraints where expected | 20% | >= 85% | | |
| Hallucinated citations | % refs not found in source corpus | 15% | <= 2% | | |
| Latency P95 | lineage synthesis latency | 5% | <= 5s | | |
| Cost/run | lineage stage average cost | 5% | <= team budget | | |

**Lineage workload pass rule:** reference resolvability must pass, and workload score >= 85/100.

| Lineage workload score (0-100) | Pass/Fail |
|---:|---|
| | |

---

## 7) Workload D — Probabilistic Verification (Weight: 20%)

| Metric | Definition (exact column meaning) | Weight | Threshold | Observed | Pass/Fail |
|---|---|---:|---:|---:|---|
| Precision of flags | true useful flags / all flags | 25% | >= 70% | | |
| Recall on known issues | detected known issues / total known issues | 20% | >= 65% | | |
| Confidence calibration | confidence-quality alignment metric | 15% | <= team target error | | |
| Actionability | % findings with concrete next-step evidence | 20% | >= 80% | | |
| Independence check | model family/path differs from generator | 10% | required | Sonnet assist path ≠ Opus generation | **PASS** |
| Latency P95 | adjudication completion latency | 5% | <= 20s | ~33ms verification step (L2; tier-1 heavy) | **PASS** |
| Cost/run | average adjudication cost | 5% | <= team budget | Negligible in L2 harness | **PASS*** |

**Probabilistic verification pass rule:** precision + actionability + independence must pass, and workload score >= 75/100.

| Probabilistic verification workload score (0-100) | Pass/Fail |
|---:|---|
| TBD (labeled set not run at L3 scale) | **CONDITIONAL** — independence OK; precision TBD |

---

## 8) Workload E — Drift Explanation/Fix (Weight: 10%)

| Metric | Definition (exact column meaning) | Weight | Threshold | Observed | Pass/Fail |
|---|---|---:|---:|---:|---|
| Explanation correctness | reviewer-validated technical correctness | 25% | >= 85% | | |
| Fix safety | % suggested fixes with no regression in tests | 30% | >= 90% | | |
| Fix applicability | % suggestions directly applicable with minimal edits | 20% | >= 80% | | |
| Hallucination in explanation | incorrect claims per sample | 10% | <= 5% | | |
| Latency P95 (async) | explain/fix suggestion latency | 10% | <= 5s | | |
| Cost/event | average drift event assist cost | 5% | <= team budget | | |

**Drift assist pass rule:** fix safety must pass, and workload score >= 80/100.

| Drift assist workload score (0-100) | Pass/Fail |
|---:|---|
| | |

---

## 9) Overall Weighted Scorecard

| Workload | Weight | Workload Score | Weighted Contribution |
|---|---:|---:|---:|
| Interrogation | 15% | | |
| Architecture generation | 35% | | |
| Decision lineage | 20% | | |
| Probabilistic verification | 20% | | |
| Drift explanation/fix | 10% | | |
| **Total** | **100%** |  |  |

---

## 10) Final Decision Thresholds

### Production Candidate PASS
- All global hard gates pass.
- All workload pass rules pass.
- Overall weighted score >= 82/100.

### Competition Demo PASS
- All global hard gates pass.
- Interrogation + Generation + Lineage pass.
- Overall weighted score >= 78/100.

### FAIL
- Any other outcome.

| Final decision | Reason summary |
|---|---|
| **CONDITIONAL PASS (Candidate A)** | L2 automated: 10/10 E2E, 0 schema failures, trust edge checks pass. **Blockers for full PASS:** manual quality sample (§4–8), interrogation latency vs 3s P95, §14 sign-off. Candidates B/C not run. |

**L2 artifact:** `apps/api/test-artifacts/l2-functional-report-2026-06-02T15-44-59-517Z.json`

---

## 11) Recommended Minimum Sample Sizes

| Workload | Minimum sample size |
|---|---:|
| Interrogation sessions | >= 100 |
| Generation prompts | >= 80 |
| Lineage chains/components | >= 200 |
| Probabilistic findings (labeled set) | >= 300 |
| Drift cases | >= 150 |

---

## 12) Model Routing Selection (Post-Eval)

Fill this after evaluating multiple candidates.

| Workload | Selected model | Backup model | Why selected | Notes |
|---|---|---|---|---|
| Interrogation | `claude-sonnet-4-6` | `claude-opus-4-8` | L2 10/10 pass; schema stable; cost-efficient | Latency >3s P95 — product waiver or UX async |
| Architecture generation | `claude-opus-4-8` | `claude-sonnet-4-6` | Opus for blueprint quality; L2 generation step fast | Frozen in `.env.local` |
| Decision lineage | `claude-opus-4-8` | `claude-sonnet-4-6` | Same routing as generation (lineage tied to plan) | Manual lineage review pending |
| Probabilistic verification | `claude-sonnet-4-6` | — | Independent from Opus generator | Tier-2 cross-model when enabled |
| Drift explanation/fix | `claude-sonnet-4-6` | — | Assist workload; deterministic drift gate primary | Not exercised in L2 harness |

---

## 12.1) Initial Evaluation Run Plan (Ready to execute)

| Workload | A: Opus | B: Sonnet | C: Llama 70B | Decision rule |
|---|---|---|---|---|
| Interrogation | Evaluate | Evaluate | Evaluate | Pick best quality/cost under threshold |
| Architecture generation | Evaluate | Evaluate | Evaluate | Prefer highest quality pass score |
| Decision lineage | Evaluate | Evaluate | Evaluate | Prefer highest resolvability + coherence |
| Probabilistic verification | Optional | Evaluate | Evaluate | Keep model family independent from generator |
| Drift explanation/fix | Optional | Evaluate | Evaluate | Optimize safety + cost |

---

## 13) Cost Snapshot Template

| Item | Value |
|---|---:|
| Avg cost per full user session | **$0.068** (L2 Candidate A, 2026-06-02) |
| Avg cost per 100 sessions | **$6.77** |
| Projected monthly sessions | _Fill (e.g. 500 → $34/mo)_ |
| Projected monthly model cost | sessions × $0.068 |
| Budget cap | _Fill team cap_ |
| Within cap (Y/N) | _Pending_ |

---

## 14) Sign-off

| Role | Name | Decision | Date |
|---|---|---|---|
| Engineering | | | |
| Product | | | |
| Security (if production) | | | |

