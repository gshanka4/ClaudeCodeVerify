#!/usr/bin/env bash
# Local staging: Postgres + Redis (Docker), real API (index.ts), Vite web.
# Uses repo `.env.local` (LLM_PROVIDER=anthropic, DATABASE_URL, etc.)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Building shared packages…"
pnpm --filter @architectai/shared build
pnpm --filter @architectai/config build

echo "→ Starting Postgres + Redis…"
docker compose -f infra/docker-compose.yml up -d
sleep 3

echo "→ Running migrations…"
pnpm --filter @architectai/api migrate

echo "→ Starting API (port ${PORT:-4000}) and web (port 5173)…"
echo "   API:  http://localhost:${PORT:-4000}/healthz"
echo "   Web:  http://localhost:5173"
echo "   Dev sign-in: Create dev user (no Clerk) or set VITE_CLERK_PUBLISHABLE_KEY"
echo ""
pnpm --filter @architectai/api dev &
API_PID=$!
pnpm --filter @architectai/web dev &
WEB_PID=$!

trap 'kill $API_PID $WEB_PID 2>/dev/null || true' INT TERM
wait
