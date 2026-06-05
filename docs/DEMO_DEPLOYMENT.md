# Demo deployment — lowest cost (product leader review)

**Goal:** Run the full loop end-to-end for a **product demo**, not production scale.

**Your frontend (already live):** `https://claude-code-verify.vercel.app` — **$0** on Vercel hobby.

---

## Cost comparison

| Stack                                                                         | ~Monthly | Good for                                        |
| ----------------------------------------------------------------------------- | -------- | ----------------------------------------------- |
| **`render-api.yaml`** (API starter + Redis + Postgres basic)                  | **~$27** | Always-on production                            |
| **`render-api-no-redis.yaml`** ⭐ (API starter + Postgres free, **no Redis**) | **~$7**  | **15-day demo — API always on, no cold starts** |
| **`render-api-demo.yaml`** (API free + Postgres free, no Redis)               | **~$0**  | Cheapest; cold starts after idle                |

\*Render free Postgres **expires after 30 days** (covers your 15-day window). Anthropic API usage is separate (pay per token).

### ⭐ Recommended for you: `render-api-no-redis.yaml`

- **Redis removed** → saves ~$10/mo (API uses in-memory streaming — fine for 1 demo user)
- **API `starter`** → always on, **no 30–60s cold start**
- **Postgres `free`** → $0 for 15 days (within 30-day free DB limit)
- **~$7 total** on Render for the month (~$3.50 if you delete the API after 15 days)

### Where ~$27 comes from (`render-api.yaml`)

| Resource          | Plan                        | ~Cost |
| ----------------- | --------------------------- | ----- |
| API               | starter                     | ~$7   |
| Redis (Key Value) | starter                     | ~$10  |
| Postgres          | basic-256mb + 15 GB storage | ~$10  |

---

## Step-by-step — always-on API, no Redis (`render-api-no-redis.yaml`)

### If you already created the ~$27 Blueprint

1. Render Dashboard → **delete** service **`architectai-redis`** (saves ~$10/mo immediately).
2. On **`architectai-api`**: confirm **Plan = Starter** (not Free) so it stays always on.
3. On **`architectai-db`**: switch to **Free** plan if you only need 15 days (Settings → change instance type).
4. Ensure API env `REDIS_URL` is **not** linked to Redis — use `redis://127.0.0.1:6379` (in-memory fallback).

**Or** delete the whole Blueprint and recreate with **`render-api-no-redis.yaml`**.

### New Blueprint (cleanest)

1. Render → **New +** → **Blueprint** → repo `ClaudeCodeVerify`.
2. Blueprint file: **`render-api-no-redis.yaml`**
3. Blueprint name: e.g. `claude-code-verify-15d`
4. **Apply**

### After 15 days — stop billing

1. Render → **architectai-api** → **Settings** → **Delete Web Service** (or suspend Blueprint).
2. Vercel frontend can stay up at no extra cost.

### Set env vars on `architectai-api`

Same as [BACKEND_DEPLOYMENT.md](./BACKEND_DEPLOYMENT.md), especially:

| Key                 | Value                                             |
| ------------------- | ------------------------------------------------- |
| `CLERK_SECRET_KEY`  | your `sk_...`                                     |
| `ANTHROPIC_API_KEY` | your `sk-ant-...`                                 |
| `PUBLIC_API_URL`    | `https://architectai-api.onrender.com` (your URL) |
| `PUBLIC_WS_URL`     | `wss://architectai-api.onrender.com/ws`           |
| `WEB_BASE_URL`      | `https://claude-code-verify.vercel.app`           |
| `LLM_MODEL_*`       | your model IDs                                    |

`DATABASE_URL` is auto-linked. `REDIS_URL` is preset (no Redis bill).

### Connect Vercel

1. Vercel → **Environment Variables** → Production:
   - `VITE_API_BASE_URL` = your Render API URL
2. **Redeploy** Production.

### Before the demo with your product leader

With **starter** API (`render-api-no-redis.yaml`), no wake-up step needed — API is always on.

1. Open `https://claude-code-verify.vercel.app` in incognito.
2. Run: sign in → architecture → interrogate → generate → verify → lock → export.

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
