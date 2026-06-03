# ArchitectAI v1 — Production Deploy (fastest path)

**Target:** First production release **today or tomorrow** — no test gates, no L3 scorecard blockers.  
**Status:** Ready to deploy after you fill secrets and run the build.  
**Step-by-step operator guide:** **[PRODUCTION_OPERATOR_RUNBOOK.md](./PRODUCTION_OPERATOR_RUNBOOK.md)** ← start here  
**Companion:** [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) (requirements) · [production_deployment_plan.md](./production_deployment_plan.md) (LLM eval — post-launch)

---

## What you are shipping (v1 scope)

| In scope | Out of scope for v1 |
|----------|---------------------|
| Web SPA: interrogate → generate → verify → lock → export | Automated CI test gates (removed from repo) |
| API + Postgres + Redis + Clerk + Anthropic | npm publish of drift-hook/MCP |
| Claude Code bundle download | L3 model scorecard sign-off |
| `/healthz` + `/readyz` | BullMQ background workers |

---

## Recommended stack (≈2–4 hours)

Use **Render** (one blueprint) or **Vercel (web) + Render (API)**.

| Piece | Service | Why |
|-------|---------|-----|
| API | Render Web Service (Node 20) | Migrations on boot, health checks |
| Postgres | Render PostgreSQL | Managed, SSL |
| Redis | Render Redis | SSE + rate limits |
| Web | Render Static Site **or** Vercel | Vite `dist/` |
| Auth | Clerk production | Required |
| LLM | Anthropic | Required (`LLM_PROVIDER=anthropic`) |

Repo includes **`render.yaml`** — connect the GitHub repo in Render → **New Blueprint**.

---

## Step 0 — Accounts & keys (30 min)

Create or gather:

1. **Clerk** — production application → `CLERK_SECRET_KEY`, `CLERK_JWT_KEY` (optional), `VITE_CLERK_PUBLISHABLE_KEY`
2. **Anthropic** — API key + choose models (example below)
3. **Render** (or your host) — billing + GitHub access
4. **Domains** (optional day 1) — `api.yourdomain.com`, `app.yourdomain.com`

Clerk dashboard → **Allowed origins**: your web URL (e.g. `https://architectai-web.onrender.com`).

---

## Step 1 — Configure production env

Copy [`.env.production.example`](../.env.production.example) into your host secret UI. **Minimum required:**

```bash
APP_ENV=production
PORT=4000

PUBLIC_API_URL=https://YOUR-API-HOST          # no trailing slash
PUBLIC_WS_URL=wss://YOUR-API-HOST/ws          # or wss://YOUR-API-HOST if WS on same host
WEB_BASE_URL=https://YOUR-WEB-HOST            # CORS origin — must match Clerk allowed origin

DATABASE_URL=postgres://...?sslmode=require
REDIS_URL=redis://... or rediss://...

CLERK_SECRET_KEY=sk_live_...
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL_INTERROGATION=claude-sonnet-4-20250514
LLM_MODEL_GENERATION=claude-opus-4-20250514
LLM_MODEL_ASSIST=claude-sonnet-4-20250514

VERIFICATION_ENABLED=true
RUN_MIGRATIONS_ON_BOOT=true
```

**Web build-time only** (static site / Vercel):

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_API_BASE_URL=https://YOUR-API-HOST      # required when web ≠ API host
```

Validate locally before deploy:

```bash
export $(grep -v '^#' .env.production | xargs)  # or set vars manually
pnpm validate:prod-env
```

---

## Step 2 — Build (local or CI)

```bash
pnpm install
export VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
export VITE_API_BASE_URL=https://YOUR-API-HOST
pnpm build:production
```

Outputs:

- `apps/api/dist/` — API entry `index.js`
- `apps/web/dist/` — static SPA

---

## Step 3 — Deploy API

### Option A — Render (from `render.yaml`)

1. Render Dashboard → **New** → **Blueprint** → select repo.
2. Set sync=false secrets in the dashboard (Clerk, Anthropic, `PUBLIC_*`, `WEB_BASE_URL`, model IDs).
3. Set `PUBLIC_API_URL` to the Render API URL (e.g. `https://architectai-api.onrender.com`).
4. Set `WEB_BASE_URL` to the static site URL once web is deployed.
5. Deploy. First boot runs migrations (`RUN_MIGRATIONS_ON_BOOT=true`).

### Option B — Docker

```bash
pnpm build:production
docker build -f infra/Dockerfile.api -t architectai-api .
docker run -p 4000:4000 --env-file .env.production architectai-api
```

### Option C — Raw Node on any VM

```bash
node apps/api/dist/index.js
# with all env vars set; process manager: systemd / pm2
```

**Smoke:**

```bash
curl -sf https://YOUR-API-HOST/healthz
curl -sf https://YOUR-API-HOST/readyz
# readyz must show database.ok: true
```

---

## Step 4 — Deploy web

### Option A — Render Static Site

- Build command: same as `render.yaml` `architectai-web` service.
- Publish directory: `apps/web/dist`.
- Env: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_BASE_URL=https://YOUR-API-HOST`.

### Option B — Vercel

- Root directory: `apps/web` (uses `vercel.json`).
- Set `VITE_*` in Vercel project env.
- **Alternative:** omit `VITE_API_BASE_URL` and add a rewrite proxy to the API (advanced).

After deploy, update API `WEB_BASE_URL` to match the live web URL and redeploy API if CORS was wrong.

---

## Step 5 — End-to-end smoke (15 min)

1. Open web URL → Clerk sign-in succeeds.
2. Create architecture → answer interrogation (3+ questions).
3. Generate → progress completes (SSE; needs Redis for best results).
4. Verification → lock architecture.
5. Export to repo → ZIP downloads with `CLAUDE.md` / `.architectai/`.

If generation stream fails: check Redis, `VITE_API_BASE_URL`, and browser network tab (CORS).

---

## Step 6 — Claude Code pilots (optional)

Share [claude-code-setup.md](./claude-code-setup.md). Ensure `PUBLIC_API_URL` in API env matches what bundles embed.

---

## Timeline (aggressive)

| When | Task |
|------|------|
| Hour 0 | Clerk + Anthropic + Render accounts; copy env template |
| Hour 1 | Blueprint deploy API + DB + Redis; set secrets |
| Hour 2 | Deploy web; fix `WEB_BASE_URL` / `VITE_API_BASE_URL` |
| Hour 3 | Smoke test full loop |
| Hour 4 | Custom domain + Clerk origins (optional) |

---

## Rollback

- **API:** Redeploy previous Render deploy or Docker tag.
- **Web:** Redeploy previous static build.
- **DB:** Migrations are forward-only; do not roll back schema without a planned SQL revert.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| API won't boot | Run `pnpm validate:prod-env`; check `CLERK_SECRET_KEY`, `PUBLIC_API_URL`, `WEB_BASE_URL`, no `mock` LLM |
| `readyz` 503 | `DATABASE_URL` wrong or migrations failed — check API logs |
| Clerk login loops | Allowed origins / redirect URLs; `VITE_CLERK_PUBLISHABLE_KEY` matches Clerk app |
| API calls fail from browser | Set `WEB_BASE_URL` on API; set `VITE_API_BASE_URL` on web build |
| Generation stuck | Redis URL; Anthropic key/quota; check `/readyz` redis status |
| OpenAPI warnings in logs | Non-fatal if spec file missing in image — API still runs |

---

## Post-v1 (not blocking launch)

- L3 model scorecard ([production_deployment_plan.md](./production_deployment_plan.md) Phase L3)
- Publish `@architectai/drift-hook` to npm
- Sentry, custom domains on all environments, staging replica

---

## Checklist

- [ ] Clerk production app + origins
- [ ] Anthropic key + models set
- [ ] `pnpm validate:prod-env` passes
- [ ] API live — `/healthz` + `/readyz` OK
- [ ] Web live — Clerk login OK
- [ ] `WEB_BASE_URL` (API) = web origin
- [ ] `VITE_API_BASE_URL` (web build) = API origin
- [ ] Full product smoke passed
- [ ] Rollback noted (previous deploy IDs)
