#!/usr/bin/env bash
# One-time production prep: move docs, remove tests. Safe to re-run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOCS=(
  production_deployment_plan.md CLAUDE_CODE_GROWTH_PIVOT.md UI_COPY_CLAUDE_CODE_AUDIT.md
  UX_ENHANCEMENT_PLAN.md ux_implementation_plan.md UX_PRODUCTION_IMPROVEMENTS.md
  new_PRD.md new_architecture.md TEST_PLAN.md changes.md LLM_PRODUCTION_INTEGRATION.md
  changes_implementation_plan_1.md changes_implementation_plan_2.md
  IMPLEMENTATION_PLAN_MIN_SATISFACTION.md model_selection_scorecard.md
  L2_FUNCTIONAL_TEST_MATRIX.md IMPLEMENTATION_PLAN_v3.md new_PRD_updated.md IMPLEMENTATION_PLAN.md
)
for f in "${DOCS[@]}"; do
  [[ -f "$ROOT/$f" ]] && mv "$ROOT/$f" "$ROOT/docs/$f"
done
for f in COMPLETE_E2E.md VERIFICATION_E2E.md; do
  [[ -f "$ROOT/apps/web/e2e/$f" ]] && mv "$ROOT/apps/web/e2e/$f" "$ROOT/docs/$f"
done

rm -rf "$ROOT/apps/api/test" "$ROOT/apps/api/test-artifacts" "$ROOT/apps/api/apps"
rm -rf "$ROOT/apps/web/e2e"
rm -f "$ROOT/apps/web/playwright.config.ts" "$ROOT/apps/web/vitest.config.ts"
rm -f "$ROOT/apps/api/vitest.config.ts" "$ROOT/packages/shared/vitest.config.ts" "$ROOT/packages/config/vitest.config.ts"
rm -rf "$ROOT/packages/shared/test" "$ROOT/packages/config/test"
rm -rf "$ROOT/apps/api/src/eval"
rm -f "$ROOT/apps/api/scripts/l2-functional-eval.ts" "$ROOT/apps/api/scripts/llm-smoke.ts" "$ROOT/apps/api/scripts/validate-llm-env.ts"

find "$ROOT/apps/web/src" -name '*.test.ts' -o -name '*.test.tsx' 2>/dev/null | while read -r f; do rm -f "$f"; done
find "$ROOT/packages" -name '*.test.ts' 2>/dev/null | while read -r f; do rm -f "$f"; done

echo "Cleanup complete."
