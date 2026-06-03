#!/usr/bin/env bash
# Validates the repo is ready to deploy + optionally your .env.production file.
# Usage:
#   ./scripts/validate-production-readiness.sh           # code + build artifacts
#   ./scripts/validate-production-readiness.sh --env     # also validate .env.production
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
FAIL=0

ok() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
bad() { echo -e "${RED}✗${NC} $1"; FAIL=1; }

echo "=== ArchitectAI production readiness ==="
echo ""

echo "## 1. Repository & build"
for f in \
  apps/api/dist/index.js \
  apps/web/dist/index.html \
  infra/Dockerfile.api \
  render.yaml \
  .env.production.example; do
  if [[ -f "$f" ]]; then ok "$f"; else bad "Missing $f — run: pnpm build:production"; fi
done

MIG_COUNT=$(find apps/api/src/db/migrations -name '*.sql' 2>/dev/null | wc -l | tr -d ' ')
if [[ "$MIG_COUNT" -ge 3 ]]; then
  ok "SQL migrations ($MIG_COUNT files)"
else
  bad "Expected migration SQL files in apps/api/src/db/migrations"
fi

echo ""
echo "## 2. Environment schema (placeholder dry-run)"
if APP_ENV=production \
  DATABASE_URL='postgres://u:p@host:5432/architectai?sslmode=require' \
  REDIS_URL='redis://127.0.0.1:6379' \
  CLERK_SECRET_KEY='sk_live_placeholder' \
  PUBLIC_API_URL='https://api.example.com' \
  PUBLIC_WS_URL='wss://api.example.com/ws' \
  WEB_BASE_URL='https://app.example.com' \
  LLM_PROVIDER=anthropic \
  ANTHROPIC_API_KEY='sk-ant-api03-placeholder123456789012345678901234567890' \
  LLM_MODEL_INTERROGATION='claude-sonnet-4-20250514' \
  LLM_MODEL_GENERATION='claude-opus-4-20250514' \
  LLM_MODEL_ASSIST='claude-sonnet-4-20250514' \
  pnpm validate:prod-env >/dev/null 2>&1; then
  ok "Production env schema validates (Zod rules OK)"
else
  bad "pnpm validate:prod-env failed — fix apps/api/src/env.ts or script"
fi

echo ""
echo "## 3. Your secrets file"
ENV_FILE="$ROOT/.env.production"
if [[ "${1:-}" == "--env" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    bad "Create $ENV_FILE from .env.production.example and re-run with --env"
  else
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    MISSING=()
    for key in APP_ENV DATABASE_URL REDIS_URL CLERK_SECRET_KEY PUBLIC_API_URL PUBLIC_WS_URL WEB_BASE_URL \
      LLM_PROVIDER ANTHROPIC_API_KEY LLM_MODEL_INTERROGATION LLM_MODEL_GENERATION LLM_MODEL_ASSIST; do
      if [[ -z "${!key:-}" ]]; then MISSING+=("$key"); fi
    done
    if [[ ${#MISSING[@]} -gt 0 ]]; then
      bad "Empty in .env.production: ${MISSING[*]}"
    else
      if pnpm validate:prod-env >/dev/null 2>&1; then
        ok ".env.production passes validate:prod-env"
      else
        bad ".env.production failed validate:prod-env (check keys/format)"
      fi
    fi
    if [[ -z "${VITE_CLERK_PUBLISHABLE_KEY:-}" ]]; then
      warn "VITE_CLERK_PUBLISHABLE_KEY not in .env.production (set on web host build env)"
    else
      ok "VITE_CLERK_PUBLISHABLE_KEY is set"
    fi
    if [[ -z "${VITE_API_BASE_URL:-}" ]]; then
      warn "VITE_API_BASE_URL not set (required for web build when API is on another host)"
    else
      ok "VITE_API_BASE_URL is set"
    fi
  fi
else
  if [[ -f "$ENV_FILE" ]]; then
    warn ".env.production exists — run: ./scripts/validate-production-readiness.sh --env"
  else
    warn "No .env.production yet — copy .env.production.example → .env.production"
  fi
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}READY:${NC} Codebase is deployable. Complete operator steps in docs/PRODUCTION_OPERATOR_RUNBOOK.md"
else
  echo -e "${RED}NOT READY:${NC} Fix items above before deploying."
  exit 1
fi
