# Demo deployment — lowest cost (product leader review)

**Goal:** Run the full loop end-to-end for a **product demo**, not production scale.

**Your frontend (already live):** `https://claude-code-verify.vercel.app` — **$0** on Vercel hobby.

---

## Cost comparison

| Stack | ~Monthly | Good for |
|-------|----------|----------|
| **`render-api.yaml`** (API starter + Redis + Postgres basic) | **~$27** | Always-on production |
| **`render-api-demo.yaml`** (API free + Postgres free, no Redis) | **~$0** on Render* | 30-day product demo |

\*Render free Postgres **expires after 30 days**. Anthropic API usage is separate (pay per token).

### Where ~$27 comes from (`render-api.yaml`)

| Resource | Plan | ~Cost |
|----------|------|-------|
| API | starter | ~$7 |
| Redis (Key Value) | starter | ~$10 |
| Postgres | basic-256mb + 15 GB storage | ~$10 |

---

## Recommended: demo blueprint (~$0)

Use **`render-api-demo.yaml`** instead of `render-api.yaml`.

**What we remove / change:**

| Change | Saves | Demo impact |
|--------|-------|-------------|
| **No Redis** | ~$10/mo | API uses in-memory SSE (fine for 1 user demo) |
| **API `plan: free`** | ~$7/mo | Cold start ~30–60s if idle 15+ min — wake API before demo |
| **Postgres `plan: free`** | ~$10/mo | 1 GB, **expires in 30 days** |

---

## Step-by-step (demo)

### If you already created the expensive Blueprint

1. Render Dashboard → delete the Blueprint (or delete **architectai-redis** service manually).
2. Create a **new** Blueprint from the same repo.
3. Blueprint file: **`render-api-demo.yaml`**

### New Blueprint

1. Render → **New +** → **Blueprint** → repo `ClaudeCodeVerify`.
2. Blueprint file: **`render-api-demo.yaml`**
3. Blueprint name: e.g. `claude-code-verify-demo`
4. **Apply**

### Set env vars on `architectai-api`

Same as [BACKEND_DEPLOYMENT.md](./BACKEND_DEPLOYMENT.md), especially:

| Key | Value |
|-----|--------|
| `CLERK_SECRET_KEY` | your `sk_...` |
| `ANTHROPIC_API_KEY` | your `sk-ant-...` |
| `PUBLIC_API_URL` | `https://architectai-api.onrender.com` (your URL) |
| `PUBLIC_WS_URL` | `wss://architectai-api.onrender.com/ws` |
| `WEB_BASE_URL` | `https://claude-code-verify.vercel.app` |
| `LLM_MODEL_*` | your model IDs |

`DATABASE_URL` is auto-linked. `REDIS_URL` is preset (no Redis bill).

### Connect Vercel

1. Vercel → **Environment Variables** → Production:
   - `VITE_API_BASE_URL` = your Render API URL
2. **Redeploy** Production.

### Before the demo with your product leader

1. Open the API URL once (`/healthz`) **2 minutes early** to wake the free service.
2. Open `https://claude-code-verify.vercel.app` in incognito.
3. Run: sign in → architecture → interrogate → generate → verify → lock → export.

---

## Anthropic cost tip

For a single demo session, LLM cost is usually **cents to low dollars**, not $27. You can:

- Use **Sonnet** for generation too (cheaper than Opus) in Render env:
  ```bash
  LLM_MODEL_GENERATION=claude-sonnet-4-20250514
  ```

---

## When to upgrade back to `render-api.yaml`

- More than a few concurrent users
- No cold starts
- Postgres beyond 30 days / more storage
- Redis for reliable SSE under load

---

## Even cheaper alternative (no Render at all)

For a **one-hour** meeting only:

1. Run API locally: `pnpm dev:staging` (PGlite, no Docker).
2. Expose with [ngrok](https://ngrok.com): `ngrok http 4000`
3. Set Vercel `VITE_API_BASE_URL` to the ngrok URL and redeploy.

**Cost:** $0 hosting; only works while your laptop is on.

---

## Related

- [BACKEND_DEPLOYMENT.md](./BACKEND_DEPLOYMENT.md) — full paid stack
- [VERCEL_FRONTEND_DEPLOY.md](./VERCEL_FRONTEND_DEPLOY.md) — frontend (done)
