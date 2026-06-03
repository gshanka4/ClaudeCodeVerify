# L2 Functional Test Matrix (Local Real-Time)

Use this during Phase L2 in `production_deployment_plan.md`.

## Scope

- Interrogate -> Generate -> Verify -> Lock -> Export
- Failure capture for timeout, schema, and trust-gate regressions
- Latency and cost note capture per scenario/candidate

## Scenario Pack (10)

1. PCI payments platform
2. HIPAA clinical platform
3. Multi-tenant marketplace
4. FinOps metering pipeline
5. Insurance claim orchestration
6. IoT telemetry ingestion
7. Retail banking transaction core
8. Global logistics planning
9. Enterprise SaaS control plane
10. GovTech case workflow

## Candidate Runs

Run each candidate with:

- `L2_CANDIDATE_ID=A` (Opus/Sonnet routing)
- `L2_CANDIDATE_ID=B` (Sonnet-heavy)
- `L2_CANDIDATE_ID=C` (OSS fallback where configured)

Command:

```bash
pnpm eval:l2:functional
```

Artifacts:

- `apps/api/test-artifacts/l2-functional-report-*.json`
- `apps/api/test-artifacts/l2-functional-report-*.md`

## Edge Case Checklist

- short prompt rejected (`400`)
- generation blocked before interrogation complete (`400`)
- trust gate blocks lock/export if verification incomplete (`409`)
- timeout path captured as failure type
- schema/JSON failures captured as failure type

## Sign-off Gate

- End-to-end success rate meets team target for selected routing
- No critical trust regressions in report summary
- Latency P95/cost figures recorded for scorecard handoff
