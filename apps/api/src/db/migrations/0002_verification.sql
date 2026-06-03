-- Phase V1: Verification Pass data layer (spec delta D8)

CREATE TYPE verification_run_status AS ENUM ('running', 'complete', 'failed');
CREATE TYPE verification_tier AS ENUM ('deterministic', 'probabilistic');
CREATE TYPE verification_verdict AS ENUM ('verified', 'unverified', 'conflict');

CREATE TABLE verification_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  architecture_id   UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version           INTEGER NOT NULL,
  status            verification_run_status NOT NULL DEFAULT 'running',
  trust_grade       SMALLINT NOT NULL DEFAULT 0,
  engine_versions   JSONB NOT NULL DEFAULT '{}',
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ
);

CREATE INDEX idx_verification_runs_architecture_id ON verification_runs(architecture_id);
CREATE INDEX idx_verification_runs_org_id ON verification_runs(organization_id);
CREATE INDEX idx_verification_runs_started_at ON verification_runs(architecture_id, started_at DESC);

CREATE UNIQUE INDEX idx_verification_runs_one_running
  ON verification_runs(architecture_id, version)
  WHERE status = 'running';

CREATE TABLE verification_findings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                UUID NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
  architecture_id       UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  service_id            UUID,
  lineage_node_id       UUID,
  "check"               TEXT NOT NULL,
  tier                  verification_tier NOT NULL,
  verdict               verification_verdict NOT NULL,
  confidence            REAL NOT NULL DEFAULT 1.0,
  ground_truth_source   JSONB NOT NULL,
  detail                TEXT NOT NULL,
  evidence_ref          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verification_findings_check_id CHECK (
    "check" IN (
      'coverage.requirement', 'coverage.justification',
      'structure.composition', 'structure.integrity',
      'governance.conformance', 'constraint.satisfiability',
      'adjudication.crossmodel', 'pattern.reference'
    )
  ),
  CONSTRAINT verification_findings_confidence_range CHECK (
    confidence >= 0 AND confidence <= 1
  )
);

CREATE INDEX idx_verification_findings_run_id ON verification_findings(run_id);
CREATE INDEX idx_verification_findings_architecture_id ON verification_findings(architecture_id);
CREATE INDEX idx_verification_findings_service_id ON verification_findings(service_id);

CREATE TABLE verification_overrides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id        UUID NOT NULL REFERENCES verification_findings(id) ON DELETE CASCADE,
  architecture_id   UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id),
  reason            TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT verification_overrides_reason_min_length CHECK (char_length(reason) >= 10)
);

CREATE UNIQUE INDEX idx_verification_overrides_one_per_finding ON verification_overrides(finding_id);
CREATE INDEX idx_verification_overrides_architecture_id ON verification_overrides(architecture_id);

-- RLS: runs scoped by organization_id (same as architectures)
ALTER TABLE verification_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_verification_runs ON verification_runs FOR ALL
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- RLS: findings + overrides scoped via parent architecture (same as lineage tables)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['verification_findings', 'verification_overrides'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation_%1$s ON %1$s FOR ALL
      USING (EXISTS (SELECT 1 FROM architectures a WHERE a.id = %1$s.architecture_id
        AND a.organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid))
      WITH CHECK (EXISTS (SELECT 1 FROM architectures a WHERE a.id = %1$s.architecture_id
        AND a.organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid))
    $f$, t);
  END LOOP;
END $$;

-- Append-only overrides for app_user (V1-EC-01)
REVOKE UPDATE, DELETE ON verification_overrides FROM app_user;

GRANT SELECT, INSERT ON verification_overrides TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON verification_runs TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON verification_findings TO app_user;
