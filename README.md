# ArchitectAI

Enterprise AI architecture governance platform. Converts engineering artifacts into
governed, production-ready architectures with **drift detection**, **contract enforcement**,
and a flagship **Decision Lineage** provenance engine — governance that follows engineers
into their IDE.

> **Docs:** [docs/new_PRD_updated.md](./docs/new_PRD_updated.md) (v3 product) · [docs/new_architecture.md](./docs/new_architecture.md) · [docs/DEPLOYMENT_PLAN.md](./docs/DEPLOYMENT_PLAN.md) (production deploy)

## Features (v3)

Independent **Verification Pass**, **Trust Grade**, **Lock gate**, and **export manifest stamp**.
Claude Code export: bundle download + `architectai init` for repo governance.

Set `VERIFICATION_ENABLED=false` to restore v2 lock/export behavior without verification gates.
`GET /readyz` reports verification subsystem status and dependency health.

## Monorepo layout

```
apps/
  web/              React 18 + Vite + Tailwind (dark-only) SPA
  api/              Node 20+ / Express 5 API
  cursor-extension/ VS Code / Cursor extension (deep-link govern + drift)
  mcp-server/       MCP tools for Claude Code runtime
packages/
  shared/           Canonical domain types (docs/02) + runtime constants
  config/           Cross-cutting config constants
  cli/              architectai init / apply-bundle
  drift-hook/       PostToolUse drift checker
  runtime-client/   Local manifest + bundle paths
infra/              docker-compose (Postgres 16 + Redis 7), Dockerfile.api
docs/               PRD, specs, deployment guides
```

## Prerequisites

- Node `>=20` (see `.nvmrc`) and pnpm `>=9`
- Docker (optional — for Postgres + Redis locally)

## Getting started (local)

```bash
pnpm install
cp .env.example .env.local
docker compose -f infra/docker-compose.yml up -d   # optional
pnpm dev:staging                                   # PGlite API + Vite web
```

- API: http://localhost:4000 — `curl http://localhost:4000/healthz`
- Web: http://localhost:5173

Without Clerk keys, the API uses **dev auth** and `POST /__dev__/provision`. In the web app, use **Create dev user & continue**.

## Production deployment (v1)

**Frontend (Vercel):** [docs/VERCEL_FRONTEND_DEPLOY.md](./docs/VERCEL_FRONTEND_DEPLOY.md)  
**Backend (Render):** [docs/BACKEND_DEPLOYMENT.md](./docs/BACKEND_DEPLOYMENT.md)  
**Full stack:** [docs/PRODUCTION_OPERATOR_RUNBOOK.md](./docs/PRODUCTION_OPERATOR_RUNBOOK.md)

```bash
pnpm validate:prod-env     # dry-run production env (needs WEB_BASE_URL, Clerk, etc.)
VITE_API_BASE_URL=https://api.example.com VITE_CLERK_PUBLISHABLE_KEY=pk_live_... pnpm build:production
```

## Common scripts

| Command | What it does |
| -------- | ------------- |
| `pnpm build` | Build all workspaces (Turborepo) |
| `pnpm typecheck` | Strict TypeScript across packages |
| `pnpm lint` | ESLint |
| `pnpm dev:staging` | Local API (PGlite) + web |
| `pnpm validate:prod-env` | Validate production env vars |
| `pnpm format` | Prettier write |

## Conventions

- **Imports:** `@/` alias inside apps; `@architectai/shared` / `@architectai/config` across packages.
- **API layers:** route → controller → service → db (`apps/api/src`).
- **Errors:** `ApiError` + shared envelope; **config:** `loadConfig()` only (fail-closed `env.ts`).
- **Commits:** Conventional Commits (commitlint).

## Database (local with Docker)

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm --filter @architectai/api migrate
```

For quick local dev without Docker, use `pnpm dev:staging` (in-process PGlite via `apps/api/dev/`).
