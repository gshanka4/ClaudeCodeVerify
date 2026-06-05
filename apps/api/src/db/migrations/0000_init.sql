-- ============================================================================
-- ArchitectAI — 0000_init
-- Mirrors docs/03 schema. Additions for v2.0:
--   * RLS policies + an `app_user` role on ALL tenant tables (fail-closed).
--   * Decision Lineage tables (spec delta D4).
-- Notes:
--   * gen_random_uuid() is core in PG13+ (no pgcrypto dependency).
--   * RLS uses NULLIF(current_setting('app.current_organization_id', true), '')
--     so an unset/empty context yields zero rows (fail-closed) without error.
--   * The API connects as the non-owner `app_user` role (or SET LOCAL ROLE to it),
--     so RLS is enforced. Provisioning/migrations run as the owner (bypass).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('owner', 'architect', 'developer', 'governance_lead', 'viewer');
CREATE TYPE org_plan AS ENUM ('starter', 'growth', 'enterprise');
CREATE TYPE org_region AS ENUM ('us-east-1', 'eu-west-1', 'ap-southeast-1');
CREATE TYPE architecture_status AS ENUM ('interrogating', 'generating', 'ready', 'draft', 'archived');
CREATE TYPE environment_target AS ENUM ('aws', 'gcp', 'azure', 'on-prem', 'multi-cloud');
CREATE TYPE layer_type AS ENUM ('gateway', 'security', 'services', 'cache', 'messaging', 'database', 'ml', 'storage', 'observability');
CREATE TYPE service_status AS ENUM ('done', 'active', 'pending', 'warning', 'error');
CREATE TYPE rule_type AS ENUM ('boundary', 'auth', 'pattern', 'naming', 'contract', 'dependency');
CREATE TYPE rule_severity AS ENUM ('critical', 'high', 'medium', 'low', 'info');
CREATE TYPE drift_severity AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE drift_status AS ENUM ('open', 'ignored', 'auto-fixed', 'exception-pending', 'exception-approved');
CREATE TYPE exception_status AS ENUM ('pending', 'approved', 'denied', 'expired');
CREATE TYPE question_status AS ENUM ('pending', 'answered', 'skipped');
CREATE TYPE question_category AS ENUM ('scale', 'security', 'compliance', 'cloud', 'data', 'messaging', 'deployment', 'migration');
CREATE TYPE export_format AS ENUM ('terraform', 'pulumi', 'openapi', 'adr-markdown', 'cursor-config');
CREATE TYPE connection_protocol AS ENUM ('REST', 'gRPC', 'Kafka', 'WebSocket', 'AMQP', 'internal');
CREATE TYPE auth_method AS ENUM ('mTLS', 'JWT', 'API-key', 'OAuth2-CC', 'none');
-- Decision Lineage (D3/D4)
CREATE TYPE lineage_node_type AS ENUM ('requirement', 'constraint', 'pattern', 'alternative', 'rule', 'contract', 'component', 'assumption', 'implication');
CREATE TYPE lineage_edge_type AS ENUM ('derives', 'selects', 'rejects', 'governs', 'produces', 'impacts', 'assumes');
CREATE TYPE lineage_source_kind AS ENUM ('interrogation', 'prd-span', 'rule', 'metric', 'inference');

-- ─── Organizations ────────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  logo_url              TEXT,
  plan                  org_plan NOT NULL DEFAULT 'starter',
  region                org_region NOT NULL DEFAULT 'us-east-1',
  sso_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  sso_provider          TEXT,
  slack_webhook_url     TEXT,
  github_org            TEXT,
  require_exception_approval BOOLEAN NOT NULL DEFAULT TRUE,
  drift_notifications   BOOLEAN NOT NULL DEFAULT TRUE,
  retention_days        INTEGER NOT NULL DEFAULT 365,
  default_ruleset_id    UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_organizations_slug ON organizations(slug);

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id          TEXT NOT NULL UNIQUE,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  avatar_url        TEXT,
  role              user_role NOT NULL DEFAULT 'developer',
  last_active_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_clerk_id ON users(clerk_id);
CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);

-- ─── Governance Rulesets ──────────────────────────────────────────────────────
CREATE TABLE governance_rulesets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id   UUID NOT NULL REFERENCES users(id),
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  version         TEXT NOT NULL DEFAULT '1.0.0',
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rulesets_organization_id ON governance_rulesets(organization_id);
CREATE UNIQUE INDEX idx_rulesets_one_default ON governance_rulesets(organization_id) WHERE is_default = TRUE;

ALTER TABLE organizations
  ADD CONSTRAINT fk_organizations_default_ruleset
  FOREIGN KEY (default_ruleset_id) REFERENCES governance_rulesets(id) ON DELETE SET NULL;

-- ─── Governance Rules ─────────────────────────────────────────────────────────
CREATE TABLE governance_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ruleset_id          UUID NOT NULL REFERENCES governance_rulesets(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,
  type                rule_type NOT NULL,
  severity            rule_severity NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL,
  rationale           TEXT NOT NULL DEFAULT '',
  condition_json      JSONB NOT NULL,
  auto_fix_json       JSONB,
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rules_ruleset_id ON governance_rules(ruleset_id);
CREATE INDEX idx_rules_code ON governance_rules(code);
CREATE UNIQUE INDEX idx_rules_ruleset_code ON governance_rules(ruleset_id, code);

-- ─── Architectures ────────────────────────────────────────────────────────────
CREATE TABLE architectures (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id         UUID NOT NULL REFERENCES users(id),
  ruleset_id            UUID REFERENCES governance_rulesets(id) ON DELETE SET NULL,
  name                  TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  status                architecture_status NOT NULL DEFAULT 'draft',
  version               INTEGER NOT NULL DEFAULT 1,
  environment_target    environment_target NOT NULL DEFAULT 'aws',
  confidence_score      SMALLINT NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  governance_score      SMALLINT NOT NULL DEFAULT 0 CHECK (governance_score BETWEEN 0 AND 100),
  ai_trust_score        SMALLINT NOT NULL DEFAULT 0 CHECK (ai_trust_score BETWEEN 0 AND 100),
  drift_score           INTEGER NOT NULL DEFAULT 0 CHECK (drift_score >= 0),
  input_prompt          TEXT NOT NULL DEFAULT '',
  interrogation_session_id UUID,
  compliance_flags      TEXT[] NOT NULL DEFAULT '{}',
  tags                  TEXT[] NOT NULL DEFAULT '{}',
  total_services        SMALLINT NOT NULL DEFAULT 0,
  total_connections     SMALLINT NOT NULL DEFAULT 0,
  adr_count             SMALLINT NOT NULL DEFAULT 0,
  openapi_spec_count    SMALLINT NOT NULL DEFAULT 0,
  generated_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_architectures_organization_id ON architectures(organization_id);
CREATE INDEX idx_architectures_created_by ON architectures(created_by_id);
CREATE INDEX idx_architectures_status ON architectures(status);
CREATE INDEX idx_architectures_name_trgm ON architectures USING GIN (name gin_trgm_ops);

-- ─── Architecture Layers ──────────────────────────────────────────────────────
CREATE TABLE arch_layers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  architecture_id   UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  type              layer_type NOT NULL,
  display_name      TEXT NOT NULL,
  layer_order       SMALLINT NOT NULL,
  confidence_score  SMALLINT NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100)
);
CREATE INDEX idx_layers_architecture_id ON arch_layers(architecture_id);
CREATE UNIQUE INDEX idx_layers_arch_type ON arch_layers(architecture_id, type);

-- ─── Architecture Services ────────────────────────────────────────────────────
CREATE TABLE arch_services (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  architecture_id   UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  layer_id          UUID REFERENCES arch_layers(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  category          layer_type NOT NULL,
  confidence_score  SMALLINT NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  status            service_status NOT NULL DEFAULT 'pending',
  description       TEXT NOT NULL DEFAULT '',
  rationale         TEXT NOT NULL DEFAULT '',
  alternatives_json JSONB NOT NULL DEFAULT '[]',
  canvas_x          REAL NOT NULL DEFAULT 0,
  canvas_y          REAL NOT NULL DEFAULT 0,
  metadata_json     JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_services_architecture_id ON arch_services(architecture_id);
CREATE INDEX idx_services_layer_id ON arch_services(layer_id);
CREATE INDEX idx_services_status ON arch_services(status);

-- ─── Service Connections ──────────────────────────────────────────────────────
CREATE TABLE service_connections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  architecture_id       UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  from_service_id       UUID NOT NULL REFERENCES arch_services(id) ON DELETE CASCADE,
  to_service_id         UUID NOT NULL REFERENCES arch_services(id) ON DELETE CASCADE,
  protocol              connection_protocol NOT NULL DEFAULT 'REST',
  auth_method           auth_method NOT NULL DEFAULT 'JWT',
  is_contract_defined   BOOLEAN NOT NULL DEFAULT FALSE,
  contract_id           UUID,
  CONSTRAINT no_self_loop CHECK (from_service_id != to_service_id)
);
CREATE INDEX idx_connections_architecture_id ON service_connections(architecture_id);
CREATE INDEX idx_connections_from ON service_connections(from_service_id);
CREATE INDEX idx_connections_to ON service_connections(to_service_id);

-- ─── Interrogation Sessions ───────────────────────────────────────────────────
CREATE TABLE interrogation_sessions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                     UUID NOT NULL REFERENCES users(id),
  architecture_id             UUID REFERENCES architectures(id) ON DELETE SET NULL,
  initial_prompt              TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'complete', 'abandoned')),
  context_gathering_progress  SMALLINT NOT NULL DEFAULT 0 CHECK (context_gathering_progress BETWEEN 0 AND 100),
  governance_coverage_progress SMALLINT NOT NULL DEFAULT 0 CHECK (governance_coverage_progress BETWEEN 0 AND 100),
  current_question_index      SMALLINT NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at                TIMESTAMPTZ
);
CREATE INDEX idx_sessions_organization_id ON interrogation_sessions(organization_id);
CREATE INDEX idx_sessions_user_id ON interrogation_sessions(user_id);
CREATE INDEX idx_sessions_architecture_id ON interrogation_sessions(architecture_id);

ALTER TABLE architectures
  ADD CONSTRAINT fk_architectures_session
  FOREIGN KEY (interrogation_session_id) REFERENCES interrogation_sessions(id) ON DELETE SET NULL;

-- ─── Interrogation Questions ──────────────────────────────────────────────────
CREATE TABLE interrogation_questions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES interrogation_sessions(id) ON DELETE CASCADE,
  question_index      SMALLINT NOT NULL,
  category            question_category NOT NULL,
  status              question_status NOT NULL DEFAULT 'pending',
  question_text       TEXT NOT NULL,
  warning_json        JSONB,
  options_json        JSONB NOT NULL DEFAULT '[]',
  selected_option_id  TEXT,
  freeform_answer     TEXT,
  confidence_impact   SMALLINT NOT NULL DEFAULT 15 CHECK (confidence_impact BETWEEN 0 AND 100),
  answered_at         TIMESTAMPTZ,
  UNIQUE (session_id, question_index)
);
CREATE INDEX idx_questions_session_id ON interrogation_questions(session_id);
CREATE INDEX idx_questions_status ON interrogation_questions(status);

-- ─── Service Contracts ────────────────────────────────────────────────────────
CREATE TABLE service_contracts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  architecture_id   UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  service_id        UUID NOT NULL REFERENCES arch_services(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  version           TEXT NOT NULL DEFAULT '1.0.0',
  openapi_spec      TEXT NOT NULL,
  endpoints_json    JSONB NOT NULL DEFAULT '[]',
  is_enforced       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contracts_architecture_id ON service_contracts(architecture_id);
CREATE INDEX idx_contracts_service_id ON service_contracts(service_id);

ALTER TABLE service_connections
  ADD CONSTRAINT fk_connections_contract
  FOREIGN KEY (contract_id) REFERENCES service_contracts(id) ON DELETE SET NULL;

-- ─── Governance Issues ────────────────────────────────────────────────────────
CREATE TABLE governance_issues (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  architecture_id     UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  service_id          UUID NOT NULL REFERENCES arch_services(id) ON DELETE CASCADE,
  rule_id             UUID NOT NULL REFERENCES governance_rules(id),
  rule_code           TEXT NOT NULL,
  severity            rule_severity NOT NULL,
  message             TEXT NOT NULL,
  auto_fix_available  BOOLEAN NOT NULL DEFAULT FALSE,
  auto_fix_diff_json  JSONB,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'auto-fixed', 'exception-approved', 'ignored')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ
);
CREATE INDEX idx_issues_architecture_id ON governance_issues(architecture_id);
CREATE INDEX idx_issues_service_id ON governance_issues(service_id);
CREATE INDEX idx_issues_status ON governance_issues(status);

-- ─── Drift Events ─────────────────────────────────────────────────────────────
CREATE TABLE drift_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  architecture_id     UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id),
  rule_id             UUID REFERENCES governance_rules(id) ON DELETE SET NULL,
  file_path           TEXT NOT NULL,
  severity            drift_severity NOT NULL,
  status              drift_status NOT NULL DEFAULT 'open',
  drift_score         INTEGER NOT NULL DEFAULT 0 CHECK (drift_score >= 0),
  rule_code           TEXT NOT NULL,
  rule_name           TEXT NOT NULL,
  what_happened       TEXT NOT NULL,
  agreed_contract_json    JSONB NOT NULL,
  current_violation_json  JSONB NOT NULL,
  impact_json         JSONB NOT NULL DEFAULT '[]',
  auto_fix_diff_json  JSONB,
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ
);
CREATE INDEX idx_drift_organization_id ON drift_events(organization_id);
CREATE INDEX idx_drift_architecture_id ON drift_events(architecture_id);
CREATE INDEX idx_drift_user_id ON drift_events(user_id);
CREATE INDEX idx_drift_status ON drift_events(status);
CREATE INDEX idx_drift_severity ON drift_events(severity);
CREATE INDEX idx_drift_detected_at ON drift_events(detected_at DESC);

-- ─── Exception Requests ───────────────────────────────────────────────────────
CREATE TABLE exception_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by_id         UUID NOT NULL REFERENCES users(id),
  reviewed_by_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  drift_event_id          UUID NOT NULL REFERENCES drift_events(id) ON DELETE CASCADE,
  rule_id                 UUID NOT NULL REFERENCES governance_rules(id),
  reason                  TEXT NOT NULL,
  business_justification  TEXT NOT NULL,
  target_resolution_date  DATE NOT NULL,
  status                  exception_status NOT NULL DEFAULT 'pending',
  review_notes            TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at             TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ
);
CREATE INDEX idx_exceptions_organization_id ON exception_requests(organization_id);
CREATE INDEX idx_exceptions_drift_event_id ON exception_requests(drift_event_id);
CREATE INDEX idx_exceptions_status ON exception_requests(status);

-- ─── Architecture Exports ─────────────────────────────────────────────────────
CREATE TABLE architecture_exports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  architecture_id   UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  requested_by_id   UUID NOT NULL REFERENCES users(id),
  format            export_format NOT NULL,
  content           TEXT NOT NULL,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exports_architecture_id ON architecture_exports(architecture_id);

-- ─── Cursor Workspace Connections ─────────────────────────────────────────────
CREATE TABLE cursor_workspaces (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id),
  architecture_id   UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  workspace_path    TEXT NOT NULL,
  workspace_hash    TEXT NOT NULL,
  api_token         TEXT NOT NULL,
  monitored_paths   TEXT[] NOT NULL DEFAULT '{"src/"}',
  ignored_paths     TEXT[] NOT NULL DEFAULT '{"node_modules/", "dist/", ".git/"}',
  last_connected_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workspaces_organization_id ON cursor_workspaces(organization_id);
CREATE INDEX idx_workspaces_user_id ON cursor_workspaces(user_id);
CREATE INDEX idx_workspaces_architecture_id ON cursor_workspaces(architecture_id);

-- ─── Audit Log (partitioned) ──────────────────────────────────────────────────
CREATE TABLE audit_events (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     UUID,
  payload_json    JSONB NOT NULL DEFAULT '{}',
  ip_address      INET,
  user_agent      TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE audit_events_2026_05 PARTITION OF audit_events FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_events_2026_06 PARTITION OF audit_events FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_events_2026_07 PARTITION OF audit_events FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
-- Catch-all so a missing monthly partition never blocks a write (rotate via job later).
CREATE TABLE audit_events_default PARTITION OF audit_events DEFAULT;

CREATE INDEX idx_audit_organization_id ON audit_events(organization_id, occurred_at DESC);
CREATE INDEX idx_audit_user_id ON audit_events(user_id, occurred_at DESC);
CREATE INDEX idx_audit_resource ON audit_events(resource_type, resource_id);

-- ─── Architecture Collaborators ───────────────────────────────────────────────
CREATE TABLE architecture_collaborators (
  architecture_id   UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_edit          BOOLEAN NOT NULL DEFAULT FALSE,
  added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (architecture_id, user_id)
);
CREATE INDEX idx_collaborators_user_id ON architecture_collaborators(user_id);

-- ─── Decision Lineage (spec delta D4) ─────────────────────────────────────────
CREATE TABLE decision_lineage_nodes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  architecture_id   UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  type              lineage_node_type NOT NULL,
  label             TEXT NOT NULL,
  detail            TEXT NOT NULL DEFAULT '',
  source_kind       lineage_source_kind,
  source_ref        TEXT,
  source_confidence SMALLINT CHECK (source_confidence BETWEEN 0 AND 100),
  service_id        UUID REFERENCES arch_services(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lineage_nodes_architecture_id ON decision_lineage_nodes(architecture_id);
CREATE INDEX idx_lineage_nodes_service_id ON decision_lineage_nodes(service_id);
CREATE INDEX idx_lineage_nodes_type ON decision_lineage_nodes(type);

CREATE TABLE decision_lineage_edges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  architecture_id   UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  from_node_id      UUID NOT NULL REFERENCES decision_lineage_nodes(id) ON DELETE CASCADE,
  to_node_id        UUID NOT NULL REFERENCES decision_lineage_nodes(id) ON DELETE CASCADE,
  type              lineage_edge_type NOT NULL,
  rationale         TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_lineage_edges_architecture_id ON decision_lineage_edges(architecture_id);
CREATE INDEX idx_lineage_edges_from ON decision_lineage_edges(from_node_id);
CREATE INDEX idx_lineage_edges_to ON decision_lineage_edges(to_node_id);

CREATE TABLE decision_traces (
  architecture_id   UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  service_id        UUID NOT NULL REFERENCES arch_services(id) ON DELETE CASCADE,
  trace_json        JSONB NOT NULL,
  confidence        SMALLINT NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (architecture_id, service_id)
);

-- ─── Triggers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_architectures_updated_at BEFORE UPDATE ON architectures FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_rulesets_updated_at BEFORE UPDATE ON governance_rulesets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_contracts_updated_at BEFORE UPDATE ON service_contracts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION sync_architecture_drift_score()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE architectures
  SET drift_score = (
    SELECT COALESCE(SUM(drift_score), 0) FROM drift_events
    WHERE architecture_id = NEW.architecture_id AND status = 'open'
  ),
  updated_at = now()
  WHERE id = NEW.architecture_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_drift_score
  AFTER INSERT OR UPDATE OF status ON drift_events
  FOR EACH ROW EXECUTE FUNCTION sync_architecture_drift_score();

-- ─── Row-Level Security ───────────────────────────────────────────────────────
-- Helper expression used by every policy:
--   NULLIF(current_setting('app.current_organization_id', true), '')::uuid

-- Org-scoped (direct organization_id column)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_organizations ON organizations FOR ALL
  USING (id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_users ON users FOR ALL
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE architectures ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_architectures ON architectures FOR ALL
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE governance_rulesets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_rulesets ON governance_rulesets FOR ALL
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE interrogation_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_sessions ON interrogation_sessions FOR ALL
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE drift_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_drift ON drift_events FOR ALL
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE exception_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_exceptions ON exception_requests FOR ALL
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE cursor_workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_workspaces ON cursor_workspaces FOR ALL
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_audit ON audit_events FOR ALL
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- Ruleset-scoped (via parent org)
ALTER TABLE governance_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_rules ON governance_rules FOR ALL
  USING (EXISTS (SELECT 1 FROM governance_rulesets r WHERE r.id = ruleset_id
    AND r.organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM governance_rulesets r WHERE r.id = ruleset_id
    AND r.organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid));

-- Architecture-scoped (via parent architecture) — incl. Decision Lineage tables
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'arch_layers','arch_services','service_connections','service_contracts',
    'governance_issues','architecture_exports',
    'decision_lineage_nodes','decision_lineage_edges','decision_traces'
  ] LOOP
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

-- ─── Application role (non-owner → RLS enforced) ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOSUPERUSER NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
-- API connects as the DB owner; must be able to SET LOCAL ROLE app_user.
GRANT app_user TO CURRENT_USER;
