# Production deployment — requirements coverage

**Last updated:** 2026-06-03  
**Deploy now:** [DEPLOYMENT_PLAN.md](./DEPLOYMENT_PLAN.md) (v1 fastest path)

## Executive summary

| Track | v1 ready? | Notes |
|-------|-----------|--------|
| **v3 verification loop** (web) | Yes | Deploy per DEPLOYMENT_PLAN |
| **Claude Code export + runtime** | Yes (beta) | Bundles + CLI in monorepo |
| **Legacy IDE extension** | Yes | Optional for v1 |
| **Real LLM in production** | Yes | `LLM_PROVIDER=anthropic` + keys |
| **Hosted infra** | Yes | `render.yaml` + `infra/Dockerfile.api` |
| **L3 scorecard** | Optional | Post-launch — see [production_deployment_plan.md](./production_deployment_plan.md) |

---

## v1 pre-deploy checklist

1. `pnpm validate:prod-env` with production-like env (includes `WEB_BASE_URL`)
2. Provision Postgres 16+, Redis 7+, Clerk production, Anthropic key
3. `pnpm build:production` with `VITE_CLERK_PUBLISHABLE_KEY` + `VITE_API_BASE_URL`
4. Deploy API → `/healthz` + `/readyz` OK
5. Deploy web → Clerk login → full loop smoke

---

## Required production environment

| Variable | Required |
|----------|----------|
| `APP_ENV=production` | Yes |
| `DATABASE_URL` | Yes (SSL) |
| `REDIS_URL` | Yes (recommended; API degrades without) |
| `CLERK_SECRET_KEY` | Yes |
| `PUBLIC_API_URL` | Yes |
| `PUBLIC_WS_URL` | Yes |
| `WEB_BASE_URL` | Yes (CORS) |
| `LLM_PROVIDER=anthropic` | Yes |
| `ANTHROPIC_API_KEY` + `LLM_MODEL_*` | Yes |
| `VITE_API_BASE_URL` | Yes on web build (split hosting) |
| `RUN_MIGRATIONS_ON_BOOT` | Recommended |

Template: [`.env.production.example`](../.env.production.example)

---

## Hosting layout

| Service | Artifact |
|---------|----------|
| API | `apps/api/dist` — `node dist/index.js` |
| Web | `apps/web/dist` — static |
| Postgres | Managed |
| Redis | Managed |

---

## Known v1 limitations

1. Redis fallback — API runs but SSE/rate limits degraded if Redis down.
2. Drift-hook — customers use monorepo `npx` until npm publish.
3. OpenAPI validator — warns if spec not bundled; non-blocking.
