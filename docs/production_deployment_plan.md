# ArchitectAI Production Deployment Plan (LLM & evaluation track)

> **Deploy v1 now:** use **[DEPLOYMENT_PLAN.md](./DEPLOYMENT_PLAN.md)** — fastest path to hosted production (no scorecard gate).  
> This document covers **post-launch** LLM quality evaluation and long-term routing — **not required** for first production cut.

**Version:** 1.2  
**Date:** 2026-06-03  
**Status:** Deferred until after v1 is live  
**Related docs:** [model_selection_scorecard.md](./model_selection_scorecard.md), [new_PRD_updated.md](./new_PRD_updated.md), [LLM_PRODUCTION_INTEGRATION.md](./LLM_PRODUCTION_INTEGRATION.md)

---

## v1 vs this plan

| v1 (now) | This document (later) |
|----------|------------------------|
| Deploy with chosen Anthropic models | A/B/C model scorecard |
| Manual smoke on production | L2 functional eval matrix |
| `pnpm validate:prod-env` | Historical `gate:*` test suites (removed from repo) |

---

## 1) Objective (evaluation track)

After v1 is live, validate that real LLM APIs meet quality bars for:

- Interrogation, generation, lineage, verification assist, drift explanation
- Deterministic verification and drift as trust backbone

**Evaluation sign-off is optional** for operating v1; use it before freezing model routing for scale.

---

## 2) Deployment strategy history

**Option B (local staging)** was used during build-out: real keys on a developer machine before cloud deploy.

**v1 production** uses **Option C — direct hosted deploy** per [DEPLOYMENT_PLAN.md](./DEPLOYMENT_PLAN.md) (Render / Vercel + managed Postgres/Redis).

---

## 3) Selected model strategy (current defaults for v1)

Ship v1 with Anthropic:

| Workload | Suggested model |
|----------|-----------------|
| Interrogation | Claude Sonnet |
| Architecture generation | Claude Opus |
| Verification assist / drift | Claude Sonnet |

Record final choices in [model_selection_scorecard.md](./model_selection_scorecard.md) when running L3.

---

## 4) End-to-end lifecycle (evaluation, post-v1)

```text
v1 live (DEPLOYMENT_PLAN)
  -> Production traffic + manual smoke
  -> Optional: L2/L3 eval on staging clone
  -> Freeze routing in scorecard
  -> Tune costs / fallbacks
```

---

## 5) Phase L0 — Local prep

- Anthropic API keys (dev/staging/prod separated)
- `.env.local` for developer machines
- Budget guardrails (`LLM_SESSION_MAX_OUTPUT_TOKENS`)

---

## 6) Phase L1 — Gateway routing

Confirm `LLM_PROVIDER=anthropic` in production; adapters in `apps/api/src/ai/`.

---

## 7) Phase L2 — Functional evaluation

Use [L2_FUNCTIONAL_TEST_MATRIX.md](./L2_FUNCTIONAL_TEST_MATRIX.md) when re-introducing automated eval scripts (optional; not in production repo today).

---

## 8) Phase L3 — Model scorecard

Fill [model_selection_scorecard.md](./model_selection_scorecard.md) before changing production model IDs.

---

## 9) Platform requirements (v1 — already implemented)

See [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md):

- Fail-closed `env.ts` (Clerk, `PUBLIC_API_URL`, `WEB_BASE_URL`, no mock LLM)
- Migrations + `/healthz` + `/readyz`
- CORS via `WEB_BASE_URL`
- Web cross-origin via `VITE_API_BASE_URL`

---

## 10) Go-live definition (v1)

v1 is live when [DEPLOYMENT_PLAN.md](./DEPLOYMENT_PLAN.md) checklist is complete — **not** when L3 scorecard is green.
