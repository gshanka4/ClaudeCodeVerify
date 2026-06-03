# Deploy frontend only on Vercel (stable production link)

Use this when you want a **shareable production URL for the web app first**, and will add the API host later.

---

## Will the Vercel link change?

| URL type | Changes on new builds? |
|----------|-------------------------|
| **Production** — `https://your-project.vercel.app` | **No** — same hostname for every Production deploy |
| **Preview** — `https://your-project-git-branch-xxx.vercel.app` | Yes — new URL per branch/commit |
| **Custom domain** — `https://app.yourdomain.com` | **No** — you control DNS |

Deploy to the **Production** branch (default: `main`). That gives you one stable link to share. Pushing again only updates the files behind the same URL.

---

## What works with frontend-only?

| Feature | Without API | With `VITE_API_BASE_URL` set later |
|---------|-------------|-------------------------------------|
| App loads, branding, routing | Yes | Yes |
| Clerk sign-in | Yes (if Clerk key set) | Yes |
| Interrogate / generate / export | No | Yes (when API is live + CORS) |

You can ship the link now for UI + auth; wire the API when ready.

---

## Step 1 — Clerk (5–10 min)

1. [Clerk Dashboard](https://dashboard.clerk.com) → your app (Development is OK for a first demo; use Production when you go live).
2. Copy **Publishable key** (`pk_test_...` or `pk_live_...`).
3. You will add the Vercel URL to **Allowed origins** after Step 4.

---

## Step 2 — Push code to GitHub

Ensure `vercel.json` at the **repo root** is committed and pushed (this repo includes it).

---

## Step 3 — Create Vercel project (10 min)

1. [vercel.com](https://vercel.com) → **Add New…** → **Project**.
2. Import your **ArchitectAI** GitHub repository.
3. **Configure Project** — use these settings (important for monorepo):

| Setting | Value |
|---------|--------|
| Framework Preset | Vite (or Other — `vercel.json` overrides) |
| Root Directory | **`.`** (repository root, not `apps/web`) |
| Build Command | *(leave empty — uses `vercel.json`)* |
| Output Directory | *(leave empty — uses `vercel.json`)* |
| Install Command | *(leave empty — uses `vercel.json`)* |

4. **Environment Variables** → add for **Production** (and Preview if you want):

| Name | Value | Required now? |
|------|--------|----------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_test_...` or `pk_live_...` | **Yes** (for sign-in) |
| `VITE_API_BASE_URL` | `https://your-api-host.com` (no trailing slash) | No — add when API exists |

5. Click **Deploy**.

First build takes ~2–4 minutes (`pnpm install` + shared packages + Vite).

---

## Step 4 — Stable production URL

1. When deploy finishes, open the deployment marked **Production**.
2. Your stable link is shown as **Domains**, e.g.:

   `https://architect-ai.vercel.app`

   (exact name depends on your Vercel project name).

3. **Clerk** → Configure → **Domains** / **Allowed origins** → add that URL exactly:

   `https://architect-ai.vercel.app`

4. Redeploy is usually **not** needed for Clerk-only changes; refresh the browser.

**Share this Production domain** — it stays the same on every future Production deploy.

---

## Step 5 — Verify (2 min)

1. Open the Production URL in an incognito window.
2. Landing page loads (dark UI).
3. Sign in with Clerk works.
4. Starting an architecture may fail API calls until `VITE_API_BASE_URL` points to a live API — expected for frontend-only.

---

## Step 6 — Later: connect the API

When your API is hosted (e.g. Render):

1. Vercel → Project → **Settings** → **Environment Variables**.
2. Set **Production**:

   `VITE_API_BASE_URL=https://your-api.onrender.com`

3. On the API, set:

   `WEB_BASE_URL=https://your-project.vercel.app`

   (same as your Vercel Production domain).

4. **Deployments** → **Redeploy** Production (rebuild required — Vite bakes env at build time).

5. Clerk allowed origins must include the Vercel URL (already done in Step 4).

---

## Optional — custom domain

Vercel → Project → **Settings** → **Domains** → add `app.yourdomain.com`.

- Production URL becomes your domain (still stable across deploys).
- Update Clerk allowed origins to include the new domain.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails `pnpm not found` | Root Directory must be `.`; `vercel.json` uses `corepack` + pnpm |
| Build fails workspace packages | Ensure `vercel.json` is at repo root with full `buildCommand` |
| Blank page | Check build logs; open browser console for JS errors |
| Clerk infinite load | Add Vercel Production URL to Clerk allowed origins |
| API network errors | Set `VITE_API_BASE_URL` and redeploy; or deploy API first |
| Wrong env after change | Redeploy Production — Vite env vars are compile-time |

---

## Local check before Vercel

```bash
export VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
# optional: export VITE_API_BASE_URL=https://...
pnpm build:production
pnpm --filter @architectai/web preview
```

---

## Related

- Full stack later: [PRODUCTION_OPERATOR_RUNBOOK.md](./PRODUCTION_OPERATOR_RUNBOOK.md)
- API on Render: [DEPLOYMENT_PLAN.md](./DEPLOYMENT_PLAN.md)
