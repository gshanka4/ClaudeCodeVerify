# Backend deployment guide (API + DB + Redis)

**Your setup today**

| Layer                    | Host            | URL                                                                   |
| ------------------------ | --------------- | --------------------------------------------------------------------- |
| **Frontend (done)**      | Vercel          | `https://claude-code-verify.vercel.app`                               |
| **Backend (this guide)** | Render          | `https://architectai-api.onrender.com` _(example — yours may differ)_ |
| **Database**             | Render Postgres | auto-linked                                                           |
| **Cache**                | Render Redis    | auto-linked                                                           |

**Repo:** [github.com/gshanka4/ClaudeCodeVerify](https://github.com/gshanka4/ClaudeCodeVerify)  
**Blueprint file:** `render-api.yaml` (API only — does not redeploy your Vercel frontend)

**15-day demo (~$7, no Redis):** use **`render-api-no-redis.yaml`** — see [DEMO_DEPLOYMENT.md](./DEMO_DEPLOYMENT.md).

**Estimated time:** 1–2 hours

---

## Action items checklist (print this)

Copy this list and check off as you go.

### Before you start

- [ ] **A1** Frontend live at `https://claude-code-verify.vercel.app`
- [ ] **A2** Clerk app created; you have **Publishable** (`pk_...`) and **Secret** (`sk_...`) keys
- [ ] **A3** Anthropic account + API key (`sk-ant-...`) with billing enabled
- [ ] **A4** [Render](https://render.com) account + GitHub connected to `ClaudeCodeVerify`

### Render (backend)

- [ ] **B1** Blueprint deployed from `render-api.yaml`
- [ ] **B2** Postgres `architectai-db` status **Available**
- [ ] **B3** Redis `architectai-redis` status **Available**
- [ ] **B4** API env vars filled (see table below)
- [ ] **B5** API deploy succeeded; logs show `ArchitectAI API listening`
- [ ] **B6** `curl https://YOUR-API/healthz` → OK
- [ ] **B7** `curl https://YOUR-API/readyz` → 200, database OK

### Connect frontend (Vercel)

- [ ] **C1** Vercel env `VITE_API_BASE_URL` = your Render API URL (no trailing slash)
- [ ] **C2** Vercel **Production** redeploy triggered
- [ ] **C3** Render API `WEB_BASE_URL` = `https://claude-code-verify.vercel.app`
- [ ] **C4** API redeployed after `WEB_BASE_URL` set

### Clerk

- [ ] **D1** Allowed origins includes `https://claude-code-verify.vercel.app` _(you likely did this already)_

### Smoke test

- [ ] **E1** Sign in on Vercel site
- [ ] **E2** Start architecture → interrogation → generate → verify → lock → export

---

## Part 1 — Gather secrets (15–30 min)

### 1.1 Clerk (backend key)

1. [Clerk Dashboard](https://dashboard.clerk.com) → your application.
2. **API keys** → copy **Secret key** (`sk_live_...` or `sk_test_...`).
3. Use the **same Clerk app** as your Vercel frontend (`VITE_CLERK_PUBLISHABLE_KEY`).

| Variable           | Where it goes                                                |
| ------------------ | ------------------------------------------------------------ |
| `CLERK_SECRET_KEY` | Render → `architectai-api` env                               |
| `CLERK_JWT_KEY`    | Optional on Render (leave empty unless you use JWT template) |

### 1.2 Anthropic

1. [console.anthropic.com](https://console.anthropic.com) → API keys.
2. Create key → copy `sk-ant-...`.

Suggested models (adjust if your account uses different IDs):

```bash
LLM_MODEL_INTERROGATION=claude-sonnet-4-20250514
LLM_MODEL_GENERATION=claude-opus-4-20250514
LLM_MODEL_ASSIST=claude-sonnet-4-20250514
```

### 1.3 Note your URLs (fill after first API deploy)

| Variable         | Value (use your real API hostname)      |
| ---------------- | --------------------------------------- |
| `PUBLIC_API_URL` | `https://architectai-api.onrender.com`  |
| `PUBLIC_WS_URL`  | `wss://architectai-api.onrender.com/ws` |
| `WEB_BASE_URL`   | `https://claude-code-verify.vercel.app` |

`WEB_BASE_URL` must match your Vercel production URL **exactly** (CORS).

---

## Part 2 — Deploy API on Render (45–60 min)

### 2.1 Create Blueprint (API only)

1. [Render Dashboard](https://dashboard.render.com) → **New +** → **Blueprint**.
2. Connect repo **`gshanka4/ClaudeCodeVerify`**.
3. When asked for the blueprint file, specify:

   **`render-api.yaml`**

   _(Not `render.yaml` — that file also defines a static web app you do not need.)_

4. Click **Apply** / **Create**.

Render creates:

- `architectai-api` — Node web service
- `architectai-db` — PostgreSQL
- `architectai-redis` — Redis

Wait until Postgres and Redis show **Available** (green).

### 2.2 Set API environment variables

Open **architectai-api** → **Environment** → add these (paste your real secrets):

| Key                       | Value                                   | Required             |
| ------------------------- | --------------------------------------- | -------------------- |
| `APP_ENV`                 | `production`                            | Yes _(often preset)_ |
| `RUN_MIGRATIONS_ON_BOOT`  | `true`                                  | Yes _(often preset)_ |
| `LLM_PROVIDER`            | `anthropic`                             | Yes                  |
| `CLERK_SECRET_KEY`        | `sk_live_...` or `sk_test_...`          | Yes                  |
| `ANTHROPIC_API_KEY`       | `sk-ant-...`                            | Yes                  |
| `LLM_MODEL_INTERROGATION` | see above                               | Yes                  |
| `LLM_MODEL_GENERATION`    | see above                               | Yes                  |
| `LLM_MODEL_ASSIST`        | see above                               | Yes                  |
| `PUBLIC_API_URL`          | `https://YOUR-API.onrender.com`         | Yes                  |
| `PUBLIC_WS_URL`           | `wss://YOUR-API.onrender.com/ws`        | Yes                  |
| `WEB_BASE_URL`            | `https://claude-code-verify.vercel.app` | Yes                  |
| `VERIFICATION_ENABLED`    | `true`                                  | Yes                  |
| `DATABASE_URL`            | _(auto from blueprint)_                 | Auto                 |
| `REDIS_URL`               | _(auto from blueprint)_                 | Auto                 |

**Rules:**

- No trailing slash on URLs.
- Do **not** set `LLM_PROVIDER=mock` in production.
- Do **not** put `CLERK_SECRET_KEY` in Vercel (frontend only gets `pk_...`).

### 2.3 Deploy the API

1. **Manual Deploy** → Deploy latest commit (or wait for auto-deploy).
2. Open **Logs** and confirm:

   ```text
   Migrations applied at boot   (or Schema up to date)
   ArchitectAI API listening
   ```

3. If boot fails with `EnvValidationError`, compare env vars to the table above.

### 2.4 Health checks

Replace `YOUR-API` with your Render hostname (e.g. `architectai-api.onrender.com`):

```bash
curl -sS https://YOUR-API/healthz
curl -sS https://YOUR-API/readyz
```

| Endpoint   | Expected                               |
| ---------- | -------------------------------------- |
| `/healthz` | `{"status":"ok",...}`                  |
| `/readyz`  | HTTP **200**, `"database":{"ok":true}` |

If `/readyz` is **503**: check logs for DB/migration errors; confirm `DATABASE_URL` is linked.

---

## Part 3 — Connect Vercel frontend to API (15 min)

The frontend was built **without** knowing the API URL. You must set it and **redeploy**.

### 3.1 Vercel environment variable

1. [Vercel](https://vercel.com) → project **claude-code-verify** → **Settings** → **Environment Variables**.
2. Add for **Production**:

   | Name                | Value                           |
   | ------------------- | ------------------------------- |
   | `VITE_API_BASE_URL` | `https://YOUR-API.onrender.com` |

   No trailing slash.

3. **Deployments** → latest Production → **⋯** → **Redeploy** (must rebuild).

### 3.2 Confirm API CORS

On Render **architectai-api**, ensure:

```bash
WEB_BASE_URL=https://claude-code-verify.vercel.app
```

If you changed it after first deploy → **Manual Deploy** API again.

---

## Part 4 — End-to-end smoke test (20 min)

Use an incognito window: [https://claude-code-verify.vercel.app](https://claude-code-verify.vercel.app)

| Step | Action                               | Pass? |
| ---- | ------------------------------------ | ----- |
| 1    | Clerk sign-in                        | ☐     |
| 2    | New architecture (prompt ≥ 20 chars) | ☐     |
| 3    | Complete interrogation (≥ 3 answers) | ☐     |
| 4    | Generation finishes (progress/SSE)   | ☐     |
| 5    | Verification pass runs               | ☐     |
| 6    | Lock architecture                    | ☐     |
| 7    | Export to repo — ZIP downloads       | ☐     |

### If something fails

| Symptom                                  | Fix                                                          |
| ---------------------------------------- | ------------------------------------------------------------ |
| Network error / CORS in browser DevTools | `WEB_BASE_URL` on API = Vercel URL; redeploy API             |
| 401 Unauthorized                         | Same Clerk app for `pk_` (Vercel) and `sk_` (API)            |
| API calls go to wrong host               | Redeploy Vercel after setting `VITE_API_BASE_URL`            |
| Generation stuck                         | Check Redis on Render; check Anthropic key/quota in API logs |
| `/readyz` 503                            | Postgres not ready or migrations failed — read API logs      |

---

## Part 5 — Optional local validation (before Render)

On your laptop (optional):

```bash
cp .env.production.example .env.production
# Fill values using the same URLs/secrets as Render
./scripts/validate-production-readiness.sh --env
```

---

## Part 6 — Costs & ops notes

| Service  | Render plan (starter)            | Notes                                                   |
| -------- | -------------------------------- | ------------------------------------------------------- |
| API      | ~$7/mo                           | Spins down on free tier — use **Starter** for always-on |
| Postgres | ~$7/mo (`basic-256mb` + storage) | Required — legacy `starter` plan no longer supported    |
| Redis    | ~$10/mo                          | Strongly recommended for SSE + rate limits              |
| Vercel   | Your existing plan               | Frontend unchanged                                      |

**Render free tier:** API sleeps after inactivity; first request is slow. For demos, upgrade API to Starter.

**Logs:** Render → architectai-api → **Logs**  
**DB console:** Render → architectai-db → **Connect**

---

## Part 7 — Rollback

| Problem                      | Action                                               |
| ---------------------------- | ---------------------------------------------------- |
| Bad API release              | Render → **Rollback** to previous deploy             |
| Bad env change               | Revert env vars → Manual Deploy                      |
| Frontend points at wrong API | Fix `VITE_API_BASE_URL` → Redeploy Vercel Production |

Database migrations are **forward-only** — do not downgrade Postgres schema without a planned SQL revert.

---

## Quick reference — your production URLs

```bash
# Frontend (stable — already deployed)
WEB=https://claude-code-verify.vercel.app

# Backend (fill after Render deploy)
API=https://architectai-api.onrender.com   # example

# Vercel Production env (after API exists)
VITE_API_BASE_URL=https://architectai-api.onrender.com

# Render API env
WEB_BASE_URL=https://claude-code-verify.vercel.app
PUBLIC_API_URL=https://architectai-api.onrender.com
PUBLIC_WS_URL=wss://architectai-api.onrender.com/ws
CLERK_SECRET_KEY=sk_...
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=anthropic
```

---

## Related docs

- [VERCEL_FRONTEND_DEPLOY.md](./VERCEL_FRONTEND_DEPLOY.md) — frontend (done)
- [PRODUCTION_OPERATOR_RUNBOOK.md](./PRODUCTION_OPERATOR_RUNBOOK.md) — full-stack variant
- [claude-code-setup.md](./claude-code-setup.md) — after export works
