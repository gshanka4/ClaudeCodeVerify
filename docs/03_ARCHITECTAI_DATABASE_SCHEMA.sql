-- ============================================================================
-- ArchitectAI — Complete PostgreSQL Database Schema
-- Database: PostgreSQL 16+
-- ORM: Drizzle (schema mirrors this SQL exactly)
-- 
-- Run order: execute this file top-to-bottom in a single transaction.
-- All tables use UUID primary keys generated via gen_random_uuid().
-- Row-Level Security (RLS) policies enforce organization isolation.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for full-text search on architecture names

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

-- ─── Organizations ────────────────────────────────────────────────────────────

CREATE TABLE organizations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  logo_url              TEXT,
  plan                  org_plan NOT NULL DEFAULT 'starter',
  region                org_region NOT NULL DEFAULT 'us-east-1',
  sso_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  sso_provider          TEXT,                        -- 'saml' | 'okta' | 'azure-ad'
  slack_webhook_url     TEXT,
  github_org            TEXT,
  require_exception_approval BOOLEAN NOT NULL DEFAULT TRUE,
  drift_notifications   BOOLEAN NOT NULL DEFAULT TRUE,
  retention_days        INTEGER NOT NULL DEFAULT 365,
  default_ruleset_id    UUID,                        -- FK added below (circular ref)
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

-- Only one default ruleset per org
CREATE UNIQUE INDEX idx_rulesets_one_default 
  ON governance_rulesets(organization_id) 
  WHERE is_default = TRUE;

-- Now add the FK from organizations
ALTER TABLE organizations 
  ADD CONSTRAINT fk_organizations_default_ruleset 
  FOREIGN KEY (default_ruleset_id) REFERENCES governance_rulesets(id) ON DELETE SET NULL;

-- ─── Governance Rules ─────────────────────────────────────────────────────────

CREATE TABLE governance_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ruleset_id          UUID NOT NULL REFERENCES governance_rulesets(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,                 -- "AP-001", "C-101", "BD-003"
  type                rule_type NOT NULL,
  severity            rule_severity NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL,
  rationale           TEXT NOT NULL DEFAULT '',
  condition_json      JSONB NOT NULL,               -- RuleCondition shape
  auto_fix_json       JSONB,                        -- AutoFixStrategy | null
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
  interrogation_session_id UUID,                    -- FK added after interrogation_sessions table
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
-- Full-text search on architecture name
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
  rationale         TEXT NOT NULL DEFAULT '',          -- AI's reasoning
  alternatives_json JSONB NOT NULL DEFAULT '[]',       -- ServiceAlternative[]
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
  contract_id           UUID,                         -- FK added after service_contracts
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

-- Add deferred FK from architectures
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
  warning_json        JSONB,                          -- QuestionWarning | null
  options_json        JSONB NOT NULL DEFAULT '[]',    -- QuestionOption[]
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
  openapi_spec      TEXT NOT NULL,                   -- full YAML/JSON
  endpoints_json    JSONB NOT NULL DEFAULT '[]',     -- ContractEndpoint[]
  is_enforced       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contracts_architecture_id ON service_contracts(architecture_id);
CREATE INDEX idx_contracts_service_id ON service_contracts(service_id);

-- Add FK from service_connections
ALTER TABLE service_connections
  ADD CONSTRAINT fk_connections_contract
  FOREIGN KEY (contract_id) REFERENCES service_contracts(id) ON DELETE SET NULL;

-- ─── Governance Issues (per service, flagged at generation time) ───────────────

CREATE TABLE governance_issues (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  architecture_id     UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  service_id          UUID NOT NULL REFERENCES arch_services(id) ON DELETE CASCADE,
  rule_id             UUID NOT NULL REFERENCES governance_rules(id),
  rule_code           TEXT NOT NULL,
  severity            rule_severity NOT NULL,
  message             TEXT NOT NULL,
  auto_fix_available  BOOLEAN NOT NULL DEFAULT FALSE,
  auto_fix_diff_json  JSONB,                         -- CodeDiff | null
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
  agreed_contract_json    JSONB NOT NULL,            -- ContractDiagram
  current_violation_json  JSONB NOT NULL,            -- ContractDiagram
  impact_json         JSONB NOT NULL DEFAULT '[]',   -- DriftImpact[]
  auto_fix_diff_json  JSONB,                         -- CodeDiff | null
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
  workspace_path    TEXT NOT NULL,                   -- local absolute path (hashed for privacy)
  workspace_hash    TEXT NOT NULL,                   -- sha256 of full path
  api_token         TEXT NOT NULL,                   -- scoped token for extension
  monitored_paths   TEXT[] NOT NULL DEFAULT '{"src/"}',
  ignored_paths     TEXT[] NOT NULL DEFAULT '{"node_modules/", "dist/", ".git/"}',
  last_connected_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspaces_organization_id ON cursor_workspaces(organization_id);
CREATE INDEX idx_workspaces_user_id ON cursor_workspaces(user_id);
CREATE INDEX idx_workspaces_architecture_id ON cursor_workspaces(architecture_id);

-- ─── Audit Log ────────────────────────────────────────────────────────────────

CREATE TABLE audit_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     UUID,
  payload_json    JSONB NOT NULL DEFAULT '{}',
  ip_address      INET,
  user_agent      TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (occurred_at);

-- Monthly partitions (create for next 12 months and automate thereafter)
CREATE TABLE audit_events_2026_05 PARTITION OF audit_events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_events_2026_06 PARTITION OF audit_events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
-- (Add future partitions via scheduled job or pg_partman)

CREATE INDEX idx_audit_organization_id ON audit_events(organization_id, occurred_at DESC);
CREATE INDEX idx_audit_user_id ON audit_events(user_id, occurred_at DESC);
CREATE INDEX idx_audit_resource ON audit_events(resource_type, resource_id);

-- ─── Architecture Collaborators (many-to-many: user ↔ architecture) ───────────

CREATE TABLE architecture_collaborators (
  architecture_id   UUID NOT NULL REFERENCES architectures(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_edit          BOOLEAN NOT NULL DEFAULT FALSE,
  added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (architecture_id, user_id)
);

CREATE INDEX idx_collaborators_user_id ON architecture_collaborators(user_id);

-- ─── Row-Level Security ───────────────────────────────────────────────────────

-- Enable RLS on all tenant-scoped tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE architectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_rulesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE arch_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE interrogation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE drift_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE exception_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- NOTE: RLS policies rely on a session variable set by the API server:
--   SET LOCAL app.current_organization_id = '<uuid>';
--   SET LOCAL app.current_user_id = '<uuid>';

CREATE POLICY tenant_isolation_architectures ON architectures
  USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY tenant_isolation_drift ON drift_events
  USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY tenant_isolation_audit ON audit_events
  USING (organization_id = current_setting('app.current_organization_id')::UUID);

-- ─── Triggers: auto-update updated_at ────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_architectures_updated_at
  BEFORE UPDATE ON architectures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_rulesets_updated_at
  BEFORE UPDATE ON governance_rulesets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON service_contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Trigger: update drift_score on architectures when drift resolved ─────────

CREATE OR REPLACE FUNCTION sync_architecture_drift_score()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE architectures
  SET drift_score = (
    SELECT COALESCE(SUM(drift_score), 0)
    FROM drift_events
    WHERE architecture_id = NEW.architecture_id
      AND status = 'open'
  ),
  updated_at = now()
  WHERE id = NEW.architecture_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_drift_score
  AFTER INSERT OR UPDATE OF status ON drift_events
  FOR EACH ROW EXECUTE FUNCTION sync_architecture_drift_score();

-- ─── Seed: Default Governance Ruleset ─────────────────────────────────────────

-- This seed creates an example ruleset. Run after inserting your first org/user.
-- Replace UUIDs with real values in your seed script.

-- INSERT INTO governance_rulesets (id, organization_id, created_by_id, name, description, version, is_default)
-- VALUES (
--   'rul-set-0000-0000-0000-000000000001',
--   '<your-org-id>',
--   '<your-user-id>',
--   'Default Enterprise Ruleset',
--   'Standard enterprise governance rules for service boundaries, auth, and anti-patterns.',
--   '1.0.0',
--   TRUE
-- );

-- INSERT INTO governance_rules (ruleset_id, code, type, severity, name, description, rationale, condition_json, auto_fix_json) VALUES
-- ('rul-set-0000-0000-0000-000000000001', 'AP-001', 'boundary', 'critical',
--   'No Direct Cross-Service DB Access',
--   'A service must not directly import from another service''s database module.',
--   'Direct DB access bypasses auth layers and creates tight coupling.',
--   '{"forbiddenImportPath": "../*-db/*", "forbiddenFrom": "*", "forbiddenTo": "*-db"}',
--   '{"type": "import-replace", "description": "Replace direct DB import with REST API call through the owning service."}'
-- ),
-- ('rul-set-0000-0000-0000-000000000001', 'C-101', 'contract', 'high',
--   'Payment Service Must Use UserService API',
--   'payment-service must access user data exclusively through the UserService REST API.',
--   'Enforces the agreed data ownership boundary from Payment Gateway V2 architecture.',
--   '{"forbiddenFrom": "payment-service", "forbiddenTo": "user-db"}',
--   NULL
-- ),
-- ('rul-set-0000-0000-0000-000000000001', 'AUTH-001', 'auth', 'critical',
--   'All External Connections Require mTLS',
--   'All service-to-service connections crossing a trust boundary must use mTLS.',
--   'Zero-trust architecture requirement for fintech environments.',
--   '{"requiredAuth": "mTLS", "appliesTo": "cross-boundary"}',
--   NULL
-- );
