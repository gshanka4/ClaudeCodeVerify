#!/usr/bin/env bash
# Build all production artifacts from repo root.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ shared + config"
pnpm --filter @architectai/shared build
pnpm --filter @architectai/config build

echo "→ API"
pnpm --filter @architectai/api build

echo "→ Web (set VITE_* in env before this step for production URLs)"
pnpm --filter @architectai/web build

echo "✓ dist: apps/api/dist, apps/web/dist"
