# Verification E2E test matrix (V3–V6)

Playwright specs under `apps/web/e2e/` covering the verification delta. API integration tests live under `apps/api/test/api/phase-v*.test.ts`.

## Run commands

| Command | What it runs |
|---------|----------------|
| `pnpm gate:complete-e2e` | **Full E2E** — `complete-flow` + all verification + ux specs |
| `pnpm gate:verification-e2e` | Verification Playwright specs only (starts E2E API on :4001) |
| `pnpm --filter @architectai/web test:e2e:complete-flow` | Golden path + edge cases only (13 tests) |
| `pnpm --filter @architectai/web test:e2e:verification` | Verification specs (from `apps/web`) |

See also [`COMPLETE_E2E.md`](./COMPLETE_E2E.md).
| `pnpm gate:v4` | Workspace UI spec only |
| `pnpm gate:v6` | Export spec only |
| `pnpm gate:v6x` | Ship smoke spec only |

Requires Playwright browsers: `pnpm --filter @architectai/web exec playwright install chromium`

## Spec files

| File | Focus |
|------|--------|
| `complete-flow.spec.ts` | Complete golden path + gate/override/dashboard edge cases |
| `verification-journey.spec.ts` | Golden paths, API edges, lock/export/dashboard matrix |
| `verification-workspace.spec.ts` | V4/V5 workspace UX rules (14–19), mocks, advisory toggle |
| `verification-export.spec.ts` | V6 export wizard stamp, dashboard trust |
| `verification-ship.spec.ts` | V6.x ship smoke, landing copy |

## E2E seed endpoints (`/__e2e__/*` on port 4001)

| Endpoint | Use |
|----------|-----|
| `POST /__e2e__/provision` | Global setup — clerk id for auth |
| `POST /__e2e__/seed-ready-verified` | Ready arch + completed verification (fast) |
| `POST /__e2e__/seed-ready-unverified` | Ready arch, no verification (gate tests) |
| `POST /__e2e__/seed-gate-conflict` | Invented service + conflict findings |

## Scenario coverage map

### Happy paths
- E2E-GOLDEN-01 — Full UI: interrogate → generate → verify → lock → export stamp
- E2E-GOLDEN-02 — Seeded verify → lock → export manifest fields
- V4-E2E-01 … V4-E2E-08 — Workspace / generation (see `verification-workspace.spec.ts`)
- V6-E2E-01 … V6-E2E-03 — Export + extension label

### Lock gate
- E2E-LOCK-01 — Conflict modal → override → lock succeeds
- E2E-LOCK-02 — Lock without verify → UI error + retry
- E2E-API-01 — Lock without verify → 409
- V4-E2E-07, V4-EC-04, V4-EC-06 — Modal, reason length, conflict canvas

### Export
- E2E-API-02 — Export without verify → 409
- V6-E2E-01 — Export wizard shows verification stamp

### API / poll
- E2E-API-03 — GET `/verification` summary
- E2E-API-04 — Dashboard list `trustGrade` + `verificationStatus`

### UX rules (V4/V5)
- V4-EC-01 … V4-EC-15 — Deterministic vs probabilistic, breakdown, no tabs, etc.
- V5-E2E-01, V5-EC-08 — Advisory styling and toggle

### Dashboard & landing
- E2E-DASH-01/02, V6-E2E-02, V6-EC-08/09, E2E-LAND-01
