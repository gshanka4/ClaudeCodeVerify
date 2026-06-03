# Production operator runbook — start here

**Purpose:** Everything you do **starting now** to deploy ArchitectAI v1 to production.  
**Time:** ~3–5 hours first time (accounts + Render + smoke test).  
**Prerequisite:** GitHub repo pushed; Node 20 + pnpm 9 on your laptop for local checks.

---

## Part 0 — Validate readiness (15 minutes, do this first)

### Step 0.1 — Code readiness (no secrets needed)

From the repo root:

```bash
pnpm install
pnpm build:production
./scripts/validate-production-readiness.sh
```

You should see all green checks including `Production env schema validates`.

### Step 0.2 — Create your production secrets file (local only)

```bash
cp .env.production.example .env.production
```

Edit `.env.production` (this file is gitignored — **never commit it**). Fill every value — see **Part 1** for where to get each one.

### Step 0.3 — Validate *your* env file

```bash
./scripts/validate-production-readiness.sh --env
```

Also run:

```bash
set -a && source .env.production && set +a && pnpm validate:prod-env
```

Expected output: `Production environment schema: OK`.

| Check | Pass criteria |
|-------|----------------|
| Schema | `pnpm validate:prod-env` exits 0 |
| Build | `apps/api/dist/index.js` and `apps/web/dist/index.html` exist |
| Clerk | `CLERK_SECRET_KEY` starts with `sk_live_` (production) |
| Anthropic | `ANTHROPIC_API_KEY` starts with `sk-ant-` |
| URLs | `PUBLIC_API_URL` and `WEB_BASE_URL` are **https** URLs with no trailing slash |
| LLM | `LLM_PROVIDER=anthropic` (not `mock`) |

**If anything fails:** fix `.env.production` before continuing.

---

## Part 1 — Create external accounts & keys (45–90 minutes)

Do these in parallel where possible.

### Step 1.1 — Clerk (authentication)

1. Go to [https://dashboard.clerk.com](https://dashboard.clerk.com).
2. Create a **Production** application (not Development).
3. Copy:
   - **Publishable key** → `VITE_CLERK_PUBLISHABLE_KEY` (web build)
   - **Secret key** → `CLERK_SECRET_KEY` (API)
4. **Paths / URLs** (Clerk → Configure → Paths):
   - Sign-in URL: `/` (or your app path)
   - After sign-in: `/` or `/workspace`
5. **Allowed origins** (Clerk → Configure → Domains):
   - Add your **web** URL once you know it (e.g. `https://architectai-web.onrender.com`).
   - You will update this again if you add a custom domain.

Write into `.env.production`:

```bash
CLERK_SECRET_KEY=sk_live_...
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
```

### Step 1.2 — Anthropic (LLM)

1. Go to [https://console.anthropic.com](https://console.anthropic.com).
2. Create an API key with billing enabled.
3. Choose models (or use defaults from `.env.production.example`):

| Variable | Suggested |
|----------|-----------|
| `LLM_MODEL_INTERROGATION` | `claude-sonnet-4-20250514` |
| `LLM_MODEL_GENERATION` | `claude-opus-4-20250514` |
| `LLM_MODEL_ASSIST` | `claude-sonnet-4-20250514` |

```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

### Step 1.3 — Render (hosting)

1. Sign up at [https://render.com](https://render.com).
2. Connect your **GitHub** account.
3. Ensure the ArchitectAI repo is visible to Render.

You will deploy via **Blueprint** (`render.yaml` in the repo root).

### Step 1.4 — Plan your public URLs

You need two URLs before filling API env:

| Role | Example (Render default) | Your env var |
|------|--------------------------|--------------|
| API | `https://architectai-api.onrender.com` | `PUBLIC_API_URL`, `VITE_API_BASE_URL` |
| Web | `https://architectai-web.onrender.com` | `WEB_BASE_URL` |

```bash
PUBLIC_API_URL=https://architectai-api.onrender.com
PUBLIC_WS_URL=wss://architectai-api.onrender.com/ws
WEB_BASE_URL=https://architectai-web.onrender.com
VITE_API_BASE_URL=https://architectai-api.onrender.com
```

> **Order note:** Deploy API first to learn the API URL, then set `WEB_BASE_URL` and redeploy API after web URL is known.

Re-run `./scripts/validate-production-readiness.sh --env`.

---

## Part 2 — Deploy infrastructure on Render (60–90 minutes)

### Step 2.1 — Launch Blueprint

1. Render Dashboard → **New +** → **Blueprint**.
2. Select the **ArchitectAI** repository.
3. Render reads `render.yaml` and proposes:
   - `architectai-api` (Node web service)
   - `architectai-db` (Postgres)
   - `architectai-redis` (Redis)
   - `architectai-web` (Static site)
4. Click **Apply**.

Wait for Postgres and Redis to become **Available** (green).

### Step 2.2 — Configure API environment variables

Open **architectai-api** → **Environment** → add variables (paste from `.env.production`):

| Key | Source |
|-----|--------|
| `APP_ENV` | `production` (often set by blueprint) |
| `RUN_MIGRATIONS_ON_BOOT` | `true` |
| `CLERK_SECRET_KEY` | Clerk dashboard |
| `ANTHROPIC_API_KEY` | Anthropic |
| `LLM_MODEL_*` | Your choices |
| `LLM_PROVIDER` | `anthropic` |
| `PUBLIC_API_URL` | Render API URL (https, no trailing slash) |
| `PUBLIC_WS_URL` | `wss://<api-host>/ws` |
| `WEB_BASE_URL` | Render web URL (update after web deploy) |
| `VERIFICATION_ENABLED` | `true` |

`DATABASE_URL` and `REDIS_URL` are usually **auto-linked** from the blueprint — confirm they appear in the env list.

**Do not** set `LLM_PROVIDER=mock`.

### Step 2.3 — Deploy API

1. **Manual Deploy** → Deploy latest commit (or wait for auto-deploy).
2. Open **Logs** — look for:
   - `Migrations applied at boot` or `Schema up to date`
   - `ArchitectAI API listening`
3. No `EnvValidationError` / fatal boot errors.

### Step 2.4 — Smoke test API

Replace `YOUR-API` with your Render API hostname:

```bash
curl -sS https://YOUR-API/healthz
curl -sS https://YOUR-API/readyz
```

| Endpoint | Expected |
|----------|----------|
| `/healthz` | `{"status":"ok",...}` |
| `/readyz` | HTTP 200, `"database":{"ok":true}` |

If `/readyz` returns 503: check logs for migration/DB connection errors; verify `DATABASE_URL`.

---

## Part 3 — Deploy web (30–45 minutes)

### Step 3.1 — Configure static site env (build-time)

Open **architectai-web** → **Environment**:

| Key | Value |
|-----|--------|
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` from Clerk |
| `VITE_API_BASE_URL` | Same as `PUBLIC_API_URL` (API origin, no trailing slash) |

These are baked in at **build** time — changing them requires a **redeploy** of the web service.

### Step 3.2 — Deploy web

1. Trigger deploy on **architectai-web**.
2. Wait for build: `vite build` succeeds.
3. Note the public URL (e.g. `https://architectai-web.onrender.com`).

### Step 3.3 — Fix CORS (critical)

1. Set **Clerk** allowed origins to the **web URL**.
2. Update **architectai-api** env:
   - `WEB_BASE_URL=https://architectai-web.onrender.com` (exact match, no trailing slash)
3. **Redeploy API** so CORS header uses the new origin.

### Step 3.4 — Smoke test web

1. Open the web URL in a browser (incognito).
2. Clerk sign-in screen appears → sign in with a test user.
3. Landing page loads after auth.

If API calls fail in DevTools → Network:
- Check `VITE_API_BASE_URL` was set **before** web build.
- Check `WEB_BASE_URL` on API matches web origin.
- Check Clerk origins.

---

## Part 4 — End-to-end product test (30 minutes)

Use a **fresh** Clerk user.

| # | Action | Pass? |
|---|--------|-------|
| 1 | Sign in | ☐ |
| 2 | Start new architecture (prompt ≥ 20 chars) | ☐ |
| 3 | Answer interrogation (≥ 3 questions) | ☐ |
| 4 | Run generation — progress completes | ☐ |
| 5 | Run verification pass | ☐ |
| 6 | Lock architecture | ☐ |
| 7 | Export to repo — ZIP downloads with `CLAUDE.md` | ☐ |

**Generation stuck?**
- Confirm Redis is running on Render.
- Check API logs for Anthropic errors (quota, model name).

---

## Part 5 — Custom domain (optional, same day or later)

### API domain

1. Render → architectai-api → **Settings** → **Custom Domains** → add `api.yourdomain.com`.
2. Add DNS CNAME as Render instructs.
3. Update env: `PUBLIC_API_URL`, `PUBLIC_WS_URL`, and redeploy API.
4. Update web build env: `VITE_API_BASE_URL` → redeploy web.

### Web domain

1. Render → architectai-web → custom domain `app.yourdomain.com`.
2. Update Clerk allowed origins.
3. Update API `WEB_BASE_URL` → redeploy API.

---

## Part 6 — Post-deploy checklist

- [ ] `validate-production-readiness.sh --env` passes locally
- [ ] `/healthz` and `/readyz` OK on production API
- [ ] Clerk login works on production web
- [ ] Full loop smoke (Part 4) passed
- [ ] `.env.production` backed up in password manager (not in git)
- [ ] Rollback: note previous Render deploy IDs for API + web

---

## Quick reference — commands

```bash
# Local validation
cp .env.production.example .env.production   # once
./scripts/validate-production-readiness.sh --env
pnpm build:production

# After changing VITE_* vars locally
set -a && source .env.production && set +a
pnpm build:production
```

---

## Troubleshooting

| Problem | What to do |
|---------|------------|
| API crash on boot | Logs → `EnvValidationError`; run `pnpm validate:prod-env` locally with same vars |
| `readyz` 503 | DB URL, migrations; Postgres plan running |
| CORS error in browser | `WEB_BASE_URL` must equal browser origin exactly |
| 401 on API | Clerk keys mismatch (dev vs live); token not sent |
| Empty export / wrong API in bundle | `PUBLIC_API_URL` wrong on API service |
| Web shows old API | Rebuild web after changing `VITE_API_BASE_URL` |

---

## Related docs

- [DEPLOYMENT_PLAN.md](./DEPLOYMENT_PLAN.md) — architecture & timeline summary
- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) — requirements matrix
- [claude-code-setup.md](./claude-code-setup.md) — pilot users after go-live
