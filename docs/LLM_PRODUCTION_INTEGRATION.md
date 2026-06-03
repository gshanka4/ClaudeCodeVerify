# ArchitectAI — LLM Production Integration Plan

**Version:** 1.0  
**Date:** 2026-05-29  
**Status:** Planned — implement **after** `UX_PRODUCTION_IMPROVEMENTS.md`  
**Companion:** `UX_PRODUCTION_IMPROVEMENTS.md` · `new_architecture.md` §4 · `IMPLEMENTATION_PLAN.md` · `TEST_PLAN.md`  
**Baseline:** `LlmGateway` + `mockLlmProvider` + `buildMockGenerationPlan` in production path today

---

## Executive summary

ArchitectAI already has the **right seam** for production AI: `apps/api/src/ai/gateway.ts`, Zod schemas, retries, and metering hooks. What is not shipped:

| Workload | Current implementation | Target |
|----------|------------------------|--------|
| Interrogation (next question) | `mockLlmProvider` — canned categories | Claude Sonnet-class structured output |
| Architecture generation | `buildMockGenerationPlan` in `generation/runner.ts` | Claude Opus-class streaming + validated plan |
| Generation SSE `stream()` on gateway | Empty progress stub | Real token stream or chunked events |
| Drift explanation / auto-fix | Minimal / deferred | Sonnet async over WebSocket |
| Decision chat / RAG | Not wired | Sonnet + pgvector |
| Embeddings | Not wired | Batch embed rules/ADRs |

**`ANTHROPIC_API_KEY` today does not enable real LLM** — `createLlmGateway` still selects the mock provider.

This document is the **backend/AI track** to run after UX shells (slow gen, failures, trace prominence) are in place.

---

## Why UX Track comes first

| If LLM first | If UX first (recommended) |
|--------------|---------------------------|
| Paying for tokens while redesigning overlays | Mock/slow-mode exercises full UI cheaply |
| Flaky CI unless mock kept | Mock stays default in CI; Anthropic only in staging/evals |
| Real latency breaks undiscovered cancel/reconnect | UX-A already built recovery paths |
| Lineage quality debated before users see trace UI | Trace panel priority proven with fixtures |

**LLM integration changes data quality; UX Track changes whether users trust the product around that data.**

---

## Architecture (target state)

```
┌──────────── Web / Extension ────────────┐
│  Interrogation · Generation SSE · Chat   │
└─────────────────┬─────────────────────┘
                  │ HTTPS / SSE / WS
                  ▼
┌────────────  LlmGateway (single entry) ────────────┐
│  routing · retries · Zod validate · repair retry    │
│  cost metering · per-org budget · audit events      │
└─────────┬───────────────────────┬──────────────────┘
          │                       │
   ┌──────▼──────┐         ┌──────▼──────┐
   │ mockProvider │         │ anthropic   │
   │ (CI/default) │         │ Provider    │
   └─────────────┘         └─────────────┘
          │                       │
          └───────────┬───────────┘
                      ▼
              Prompt registry (versioned)
              + eval goldens (CI/staging)
```

**Rule:** Vendor SDKs only inside `apps/api/src/ai/providers/*`. Services call `LlmGateway`, never Anthropic directly.

---

## Environment & configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `LLM_PROVIDER` | `mock` \| `anthropic` | `mock` |
| `ANTHROPIC_API_KEY` | Provider auth | — |
| `LLM_MODEL_INTERROGATION` | Sonnet-class | from `packages/config` |
| `LLM_MODEL_GENERATION` | Opus-class | from `packages/config` |
| `LLM_MODEL_ASSIST` | Chat/drift explain | Sonnet-class |
| `LLM_MAX_OUTPUT_TOKENS_*` | Per workload caps | conservative MVP |
| `LLM_ORG_BUDGET_TOKENS_DAILY` | Hard stop / soft warn | optional MVP |
| `OPENAI_API_KEY` | Fallback provider (Phase L2) | optional |

Update `.env.example` and `new_architecture.md` §12.4 when implementing.

**Boot behavior:** misconfigured `LLM_PROVIDER=anthropic` without key → **fail-closed** at startup (MVP-EC-03).

---

## Workloads (detailed)

### LLM-1 — Interrogation question generation

**Today:** `interrogation.service.ts` → `llm.generateStructured` with `promptId: "interrogation.next_question"` → mock only.

**Target:**

- Adaptive next question from: `initialPrompt`, answered questions, imports (when present), categories not yet used.
- Respect `INTERROGATION.maxQuestions` and Phase H rule: **no early `sessionComplete` until 7 resolved** (ignore or gate `suggestComplete` from model).
- Structured schema: `generatedQuestionSchema` (existing).
- **Bounded repair:** invalid JSON → 1–2 repair prompts → fallback question (P2-EC-04 behavior, already tested with mock).

**Files:**

- `apps/api/src/ai/providers/anthropic.ts` (new)
- `apps/api/src/ai/prompts/interrogation.next_question.ts` (registry)
- `apps/api/src/services/interrogation.service.ts`

**Acceptance:**

- [ ] Staging: 10 diverse prompts produce valid Zod payloads ≥95% (eval suite)
- [ ] CI: still 100% mock
- [ ] Latency P95 &lt; 3s per question (Sonnet-class)

---

### LLM-2 — Architecture generation (critical path)

**Today:** `runGenerationJob` → `buildMockGenerationPlan` → persist + SSE hub.

**Target:**

1. Gateway streaming or chunked structured generation plan.
2. Zod validate full plan before persist.
3. **Lineage integrity** — `LineageIntegrityError` on bad refs; repair retry (P3-EC-05).
4. Persist via existing `persistGenerationResult`.
5. SSE events unchanged in shape (`node`, `governance`, `progress`, `complete`, `error`) so **UX Track overlay needs no redesign**.

**Files:**

- `apps/api/src/generation/runner.ts` — branch on `LLM_PROVIDER`
- `apps/api/src/ai/prompts/generation.plan.ts`
- `apps/api/src/ai/schemas/generation.ts` (if not complete)
- `apps/api/src/ai/gateway.ts` — implement `stream()` for generation

**Acceptance:**

- [ ] End-to-end: 7 answers → stream → workspace with ≥5 services and valid lineage traces
- [ ] P95 generation &lt; 30s (staging, warm)
- [ ] Cancel mid-job stops provider + marks arch failed cleanly
- [ ] Mock path unchanged for `pnpm gate:phase3` / `gate:phase-h`

---

### LLM-3 — Drift explanation & auto-fix (off hot path)

**Today:** Deterministic drift detection (&lt;200ms, zero LLM — keep forever).

**Target:**

- After detection, enqueue enrichment job → Sonnet → push `drift.explained` / fix suggestion over WS.
- Hot path unchanged; test P5-EC-02 (zero LLM on `/drift/check`) still passes.

**Acceptance:**

- [ ] IDE receives explanation within 5s of critical drift (async)
- [ ] Enrichment failure does not block detection result (P5-EC-09)

---

### LLM-4 — Decision lineage chat (“Ask this decision”)

**Today:** `decisionLineageService.chatDecisionLineage` may use templated/mock responses — verify and replace.

**Target:** RAG over lineage nodes + rules; streaming response; grounded flag when citations exist.

**Depends on:** LLM-5 embeddings.

---

### LLM-5 — Embeddings & RAG (pgvector)

**Scope:** Index governance rules, ADRs, prior architectures per org.

**Deliverables:**

- Embedding provider in gateway
- `embeddings` table / pgvector column (per `docs/03`)
- Retrieval in generation + chat prompts

**Defer to LLM-2.1** if MVP ship is tight; not blocking first real generation.

---

## Provider implementation checklist

### `anthropic.ts` provider

- [ ] `generateStructured<T>(params)` using Messages API + tool/json schema
- [ ] Streaming adapter for generation (`AsyncGenerator`)
- [ ] Timeout per workload (interrogation 15s, generation 120s)
- [ ] Map usage → `LlmUsage` for metering
- [ ] Classify errors: retryable (429, 5xx) vs fatal (400, content policy)

### `createLlmGateway` wiring

```ts
// Target behavior (pseudocode)
if (env.LLM_PROVIDER === "anthropic") {
  if (!env.ANTHROPIC_API_KEY) throw new Error("...");
  return new LlmGateway({ provider: new AnthropicProvider(...) });
}
return new LlmGateway({ provider: mockLlmProvider });
```

Remove misleading log: “using mock until adapter ships” when key is set.

---

## Prompt registry & eval harness

| Item | Location | Gate |
|------|----------|------|
| Versioned prompts | `apps/api/src/ai/prompts/*.ts` | Code review + version bump |
| Golden inputs | `apps/api/test/ai/goldens/*.json` | `pnpm gate:llm-eval` (staging only) |
| Interrogation eval | P2-UT-01 extend | Schema + category coverage |
| Generation eval | P3-EC-05 extend | Lineage ref resolution |
| Regression budget | Max $ per CI nightly | Optional |

**CI strategy:**

| Job | Provider | When |
|-----|----------|------|
| PR / main unit + IT | `mock` | Always |
| Nightly staging | `anthropic` | Secret in GitHub |
| Pre-release | Manual `gate:llm-staging` | Before 7.x ship |

---

## Cost, safety, observability

| Concern | Implementation |
|---------|----------------|
| **Cost per request** | Gateway metering → `audit_events` type `llm.usage` (MVP-OBS-02) |
| **Per-org budget** | Redis counter; soft warn in UI; hard 429 when exceeded |
| **Prompt injection** | Treat uploads as untrusted; isolate in system prompt; max input chars |
| **PII** | Log redaction in pino; no raw prompts in Sentry |
| **Cancellable jobs** | BullMQ job id + abort signal to provider |
| **Tracing** | `traceId` on interrogation session → generation arch → SSE |

---

## Persistence & workers (production ops)

LLM Track must confirm **non-memory** paths for staging/prod:

| Component | MVP lean | Verify |
|-----------|----------|--------|
| Postgres | Neon/Supabase | Generation + sessions survive restart |
| Redis | Upstash | SSE fan-out / rate limits |
| BullMQ worker | Render/Fly worker | Generation jobs durable |
| Export storage | R2/S3 or inline → object store | Large bundles |

**SSE reconnect:** Redis-backed `Last-Event-ID` replay (complements UX-P0-05).

---

## Implementation phases (LLM Track)

| Phase | Theme | Depends on | Gate |
|-------|-------|------------|------|
| **LLM-A** | Anthropic provider + gateway wiring + env | UX-A complete (recommended) | `gate:llm-a` — provider unit tests |
| **LLM-B** | Interrogation real questions | LLM-A | `gate:llm-b` — staging eval + mock IT green |
| **LLM-C** | Generation plan + streaming | LLM-A, UX-A | `gate:llm-c` — `gate:phase3` + staging smoke |
| **LLM-D** | Drift enrichment async | LLM-A | `gate:llm-d` — P5 hot path still zero LLM |
| **LLM-E** | RAG + decision chat | LLM-B, LLM-C | `gate:llm-e` — optional for 7.x |
| **LLM-F** | Cost budgets + observability | LLM-C | MVP-OBS-02, MVP-SEC-01 |

Suggested `package.json` gates when implementing:

```json
"gate:llm-a": "pnpm --filter @architectai/api exec vitest run test/ai/anthropic.provider.test.ts",
"gate:llm-b": "pnpm --filter @architectai/api exec vitest run test/api/interrogation-gates.test.ts test/ai/interrogation.eval.test.ts",
"gate:llm-c": "pnpm gate:phase3 && pnpm --filter @architectai/api exec vitest run test/api/full-loop.smoke.test.ts",
"gate:llm-production": "pnpm gate:ux-e && pnpm gate:llm-c && pnpm gate:llm-d"
```

---

## Testing matrix (LLM-specific)

| ID | Type | Expected |
|----|------|----------|
| LLM-UT-01 | Provider parses valid structured output | Zod pass |
| LLM-UT-02 | Provider repair on malformed JSON | Second attempt succeeds |
| LLM-IT-01 | Interrogation 7-turn session (staging) | All questions unique-ish, valid schema |
| LLM-IT-02 | Generation → lineage refs resolve | `source.ref` integrity |
| LLM-IT-03 | `LLM_PROVIDER=mock` CI | No network |
| LLM-EC-01 | Provider 429 | Retry then succeed or fallback |
| LLM-EC-02 | Provider timeout | User sees actionable error (UX-P0-04) |
| LLM-EC-03 | Budget exceeded | 429 + clear message |
| LLM-EC-04 | Cancel mid-generation | Job stopped; arch not `ready` |
| LLM-PERF-01 | Staging P95 gen &lt; 30s | 10 runs |
| LLM-EVAL-01 | Golden suite pass rate ≥ threshold | Nightly |

Add section to `TEST_PLAN.md` when LLM-A starts.

---

## Rollout strategy

| Stage | Audience | Provider | Risk |
|-------|----------|----------|------|
| 1 | Local dev | `mock` default | None |
| 2 | Staging | `anthropic` | Internal dogfood |
| 3 | Prod beta flag | per-org `llmEnabled` | Limited blast radius |
| 4 | Prod default | `anthropic` | Full |

**Feature flag:** `organization.settings.llmEnabled` or env override for first external testers.

**Rollback:** set `LLM_PROVIDER=mock` — generation must still work for demos.

---

## Definition of done (LLM Track)

LLM Track is complete for **MVP 7.x ship** when:

1. Interrogation and generation use **Anthropic in staging/prod** with mock in CI.
2. `pnpm gate:phase3`, `gate:phase-h`, `gate:pre-ship` green on mock.
3. Staging `gate:llm-c` green with real keys.
4. MVP-OBS-02: LLM cost visible per request.
5. P95 generation &lt; 30s on staging under normal load.
6. Eval goldens meet agreed pass rate; no systematic lineage fabrication.
7. UX Track gates still green (no regression on failure/reconnect UI).

---

## What stays mock forever

- All PR CI unit/integration tests (deterministic, free, fast)
- Playwright E2E default (optional `LLM_E2E=1` nightly job)
- Local dev without keys (`pnpm dev:local`)

---

## Dependencies on UX Track

| UX item | LLM benefit |
|---------|-------------|
| UX-P0-01–05 (overlay) | Real 30s stream uses same UI |
| UX-P0-04 failure panel | Provider errors map to same component |
| UX-P1-02 trace default | Users judge real lineage immediately |
| UX-P0-07 resume | Longer interrogation with real questions |

---

## Out of scope (LLM Track v1)

- OpenAI fallback adapter (LLM-F optional)
- Multi-model routing per tenant
- Fine-tuning / custom models
- Terraform generation via LLM
- SOC2 / pen-test (Phase 8)

---

## Next action

1. Complete **UX Track UX-A** (generation overlay trust).
2. Start **LLM-A**: `anthropic.ts` + `LLM_PROVIDER` + fail-closed boot.
3. **LLM-B** before **LLM-C** if you want cheaper iteration; **LLM-C** is the revenue-critical path.

---

## Traceability

| Code today | LLM phase |
|------------|-----------|
| `apps/api/src/ai/gateway.ts` | LLM-A |
| `apps/api/src/ai/providers/mock.ts` | Keep; LLM-UT-03 |
| `apps/api/src/generation/runner.ts` + `mock-plan.ts` | LLM-C |
| `apps/api/src/services/interrogation.service.ts` | LLM-B |
| `new_architecture.md` §4 workloads 1–5 | This plan |
| `TEST_PLAN.md` P2-EC-04, P3-EC-05/06, MVP-OBS-02 | LLM-B, LLM-C, LLM-F |
