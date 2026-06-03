# Complete E2E test guide

End-to-end coverage for the verification product loop (V3–V6) plus workspace/export UX, with happy paths and edge cases.

## Quick start

```bash
# Install browser once
pnpm --filter @architectai/web exec playwright install chromium

# Full matrix: golden path + all edge cases + workspace/export UX (~50+ tests)
pnpm gate:complete-e2e

# Focused complete-flow spec only (13 scenarios)
pnpm --filter @architectai/web test:e2e:complete-flow

# Verification-only (4 specs, no CHG ux)
pnpm gate:verification-e2e
```

Playwright starts **API :4001** and **web :5174** automatically (`playwright.config.ts`).

## Spec files

| File | Scenarios |
|------|-----------|
| `complete-flow.spec.ts` | **Start here** — COMPLETE-01/02 golden paths + COMPLETE-EC-01…11 edge cases |
| `verification-journey.spec.ts` | API edges, lock/export/dashboard matrix |
| `verification-workspace.spec.ts` | V4/V5 rules (14–19), mocks, advisory toggle |
| `verification-export.spec.ts` | V6 export stamp, dashboard trust |
| `verification-ship.spec.ts` | V6.x ship smoke |
| `ux-workspace.spec.ts` | CHG-1 lineage graph in main stage |
| `ux-export-install.spec.ts` | CHG-2 IDE install funnel |

## Complete-flow scenario map

### Golden path
| ID | Flow |
|----|------|
| COMPLETE-01 | Interrogate → generate → verify overlay → workspace → lock → export stamp |
| COMPLETE-02 | Seeded verified → lock → API export manifest (`verificationRunId`, `trustGrade`) |

### Verification gates (edge)
| ID | Flow |
|----|------|
| COMPLETE-EC-01 | Lock API 409 without verification |
| COMPLETE-EC-02 | Export API 409 without verification |
| COMPLETE-EC-03 | Lock UI error + retry on unverified arch |
| COMPLETE-EC-04 | Export wizard auto-lock error on unverified arch |
| COMPLETE-EC-05 | Conflict modal → override → lock |
| COMPLETE-EC-06 | Override requires ≥10 char reason |
| COMPLETE-EC-07 | Dashboard trust grade (verified) |
| COMPLETE-EC-08 | Dashboard pending badge (unverified) |
| COMPLETE-EC-09 | GET `/verification` summary |
| COMPLETE-EC-10 | Lock network failure → retry CTA |
| COMPLETE-EC-11 | Canvas `loading` verdict → resolved rollup |

## E2E seeds (`POST /__e2e__/*` on :4001)

| Endpoint | Use |
|----------|-----|
| `provision` | Global setup auth clerk id |
| `seed-ready-verified` | Ready + completed verification |
| `seed-ready-unverified` | Ready, no verification (409 gates) |
| `seed-gate-conflict` | Invented service + conflict findings |

## API + unit gates (optional, deeper)

```bash
pnpm gate:v6x    # V0–V6.x API integration + ship E2E subset
pnpm gate:v3-ship # v6x + full Playwright (same as complete-e2e + API chain)
```

## Manual testing

```bash
pnpm dev:local   # API :4000, web :5173 (PGlite)
```

Use the same prompt as E2E: payment gateway, 10k RPS, PCI, multi-region AWS.
