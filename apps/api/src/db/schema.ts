/**
 * Drizzle schema — mirrors `apps/api/src/db/migrations/0000_init.sql` (which in
 * turn mirrors `docs/03`). The SQL migration is the DDL source of truth
 * (partitioning / RLS / triggers aren't expressible in Drizzle); this file
 * provides typed query building. Add tables here as later phases need them.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const userRole = pgEnum("user_role", [
  "owner",
  "architect",
  "developer",
  "governance_lead",
  "viewer",
]);
export const orgPlan = pgEnum("org_plan", ["starter", "growth", "enterprise"]);
export const orgRegion = pgEnum("org_region", ["us-east-1", "eu-west-1", "ap-southeast-1"]);
export const architectureStatus = pgEnum("architecture_status", [
  "interrogating",
  "generating",
  "ready",
  "draft",
  "archived",
]);
export const environmentTarget = pgEnum("environment_target", [
  "aws",
  "gcp",
  "azure",
  "on-prem",
  "multi-cloud",
]);
export const layerType = pgEnum("layer_type", [
  "gateway",
  "security",
  "services",
  "cache",
  "messaging",
  "database",
  "ml",
  "storage",
  "observability",
]);
export const ruleType = pgEnum("rule_type", [
  "boundary",
  "auth",
  "pattern",
  "naming",
  "contract",
  "dependency",
]);
export const ruleSeverity = pgEnum("rule_severity", ["critical", "high", "medium", "low", "info"]);
export const lineageNodeType = pgEnum("lineage_node_type", [
  "requirement",
  "constraint",
  "pattern",
  "alternative",
  "rule",
  "contract",
  "component",
  "assumption",
  "implication",
]);
export const lineageEdgeType = pgEnum("lineage_edge_type", [
  "derives",
  "selects",
  "rejects",
  "governs",
  "produces",
  "impacts",
  "assumes",
]);
export const lineageSourceKind = pgEnum("lineage_source_kind", [
  "interrogation",
  "prd-span",
  "rule",
  "metric",
  "inference",
]);
export const questionStatus = pgEnum("question_status", ["pending", "answered", "skipped"]);
export const serviceStatus = pgEnum("service_status", [
  "done",
  "active",
  "pending",
  "warning",
  "error",
]);
export const connectionProtocol = pgEnum("connection_protocol", [
  "REST",
  "gRPC",
  "Kafka",
  "WebSocket",
  "AMQP",
  "internal",
]);
export const authMethod = pgEnum("auth_method", [
  "mTLS",
  "JWT",
  "API-key",
  "OAuth2-CC",
  "none",
]);
export const driftSeverity = pgEnum("drift_severity", ["critical", "high", "medium", "low"]);
export const driftStatus = pgEnum("drift_status", [
  "open",
  "ignored",
  "auto-fixed",
  "exception-pending",
  "exception-approved",
]);
export const exceptionStatus = pgEnum("exception_status", [
  "pending",
  "approved",
  "denied",
  "expired",
]);
export const exportFormat = pgEnum("export_format", [
  "terraform",
  "pulumi",
  "openapi",
  "adr-markdown",
  "claude-code-bundle",
  "cursor-config",
]);

export const ideTarget = pgEnum("ide_target", [
  "claude-code",
  "vscode",
  "cursor",
  "antigravity",
]);

export const verificationRunStatus = pgEnum("verification_run_status", [
  "running",
  "complete",
  "failed",
]);
export const verificationTier = pgEnum("verification_tier", ["deterministic", "probabilistic"]);
export const verificationVerdict = pgEnum("verification_verdict", [
  "verified",
  "unverified",
  "conflict",
]);

export const questionCategory = pgEnum("question_category", [
  "scale",
  "security",
  "compliance",
  "cloud",
  "data",
  "messaging",
  "deployment",
  "migration",
]);

// ─── Tables ──────────────────────────────────────────────────────────────────
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  plan: orgPlan("plan").notNull().default("starter"),
  region: orgRegion("region").notNull().default("us-east-1"),
  ssoEnabled: boolean("sso_enabled").notNull().default(false),
  ssoProvider: text("sso_provider"),
  slackWebhookUrl: text("slack_webhook_url"),
  githubOrg: text("github_org"),
  requireExceptionApproval: boolean("require_exception_approval").notNull().default(true),
  driftNotifications: boolean("drift_notifications").notNull().default(true),
  retentionDays: integer("retention_days").notNull().default(365),
  defaultRulesetId: uuid("default_ruleset_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull().unique(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    role: userRole("role").notNull().default("developer"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_users_organization_id").on(t.organizationId)],
);

export const governanceRulesets = pgTable(
  "governance_rulesets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    version: text("version").notNull().default("1.0.0"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_rulesets_organization_id").on(t.organizationId)],
);

export const governanceRules = pgTable(
  "governance_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rulesetId: uuid("ruleset_id")
      .notNull()
      .references(() => governanceRulesets.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    type: ruleType("type").notNull(),
    severity: ruleSeverity("severity").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    rationale: text("rationale").notNull().default(""),
    conditionJson: jsonb("condition_json").notNull(),
    autoFixJson: jsonb("auto_fix_json"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_rules_ruleset_id").on(t.rulesetId),
    uniqueIndex("idx_rules_ruleset_code").on(t.rulesetId, t.code),
  ],
);

export const architectures = pgTable(
  "architectures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    rulesetId: uuid("ruleset_id").references(() => governanceRulesets.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: architectureStatus("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    environmentTarget: environmentTarget("environment_target").notNull().default("aws"),
    confidenceScore: smallint("confidence_score").notNull().default(0),
    governanceScore: smallint("governance_score").notNull().default(0),
    aiTrustScore: smallint("ai_trust_score").notNull().default(0),
    driftScore: integer("drift_score").notNull().default(0),
    inputPrompt: text("input_prompt").notNull().default(""),
    interrogationSessionId: uuid("interrogation_session_id"),
    complianceFlags: text("compliance_flags")
      .array()
      .notNull()
      .default(sql`'{}'`),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'`),
    totalServices: smallint("total_services").notNull().default(0),
    totalConnections: smallint("total_connections").notNull().default(0),
    adrCount: smallint("adr_count").notNull().default(0),
    openapiSpecCount: smallint("openapi_spec_count").notNull().default(0),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_architectures_organization_id").on(t.organizationId),
    index("idx_architectures_status").on(t.status),
  ],
);

export const interrogationSessions = pgTable(
  "interrogation_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    architectureId: uuid("architecture_id").references(() => architectures.id, { onDelete: "set null" }),
    initialPrompt: text("initial_prompt").notNull(),
    status: text("status").notNull().default("active"),
    contextGatheringProgress: smallint("context_gathering_progress").notNull().default(0),
    governanceCoverageProgress: smallint("governance_coverage_progress").notNull().default(0),
    currentQuestionIndex: smallint("current_question_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_sessions_organization_id").on(t.organizationId),
    index("idx_sessions_user_id").on(t.userId),
  ],
);

export const interrogationQuestions = pgTable(
  "interrogation_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => interrogationSessions.id, { onDelete: "cascade" }),
    questionIndex: smallint("question_index").notNull(),
    category: questionCategory("category").notNull(),
    status: questionStatus("status").notNull().default("pending"),
    questionText: text("question_text").notNull(),
    warningJson: jsonb("warning_json"),
    optionsJson: jsonb("options_json").notNull().default([]),
    selectedOptionId: text("selected_option_id"),
    freeformAnswer: text("freeform_answer"),
    confidenceImpact: smallint("confidence_impact").notNull().default(15),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_questions_session_id").on(t.sessionId),
    uniqueIndex("uq_questions_session_index").on(t.sessionId, t.questionIndex),
  ],
);

export const architectureCollaborators = pgTable(
  "architecture_collaborators",
  {
    architectureId: uuid("architecture_id")
      .notNull()
      .references(() => architectures.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canEdit: boolean("can_edit").notNull().default(false),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.architectureId, t.userId] })],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").notNull().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),
    payloadJson: jsonb("payload_json").notNull().default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.id, t.occurredAt] })],
);

export const archLayers = pgTable(
  "arch_layers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    architectureId: uuid("architecture_id")
      .notNull()
      .references(() => architectures.id, { onDelete: "cascade" }),
    type: layerType("type").notNull(),
    displayName: text("display_name").notNull(),
    layerOrder: smallint("layer_order").notNull(),
    confidenceScore: smallint("confidence_score").notNull().default(0),
  },
  (t) => [index("idx_layers_architecture_id").on(t.architectureId)],
);

export const archServices = pgTable(
  "arch_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    architectureId: uuid("architecture_id")
      .notNull()
      .references(() => architectures.id, { onDelete: "cascade" }),
    layerId: uuid("layer_id").references(() => archLayers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    category: layerType("category").notNull(),
    confidenceScore: smallint("confidence_score").notNull().default(0),
    status: serviceStatus("status").notNull().default("pending"),
    description: text("description").notNull().default(""),
    rationale: text("rationale").notNull().default(""),
    alternativesJson: jsonb("alternatives_json").notNull().default([]),
    canvasX: real("canvas_x").notNull().default(0),
    canvasY: real("canvas_y").notNull().default(0),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_services_architecture_id").on(t.architectureId)],
);

export const serviceConnections = pgTable(
  "service_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    architectureId: uuid("architecture_id")
      .notNull()
      .references(() => architectures.id, { onDelete: "cascade" }),
    fromServiceId: uuid("from_service_id")
      .notNull()
      .references(() => archServices.id, { onDelete: "cascade" }),
    toServiceId: uuid("to_service_id")
      .notNull()
      .references(() => archServices.id, { onDelete: "cascade" }),
    protocol: connectionProtocol("protocol").notNull().default("REST"),
    authMethod: authMethod("auth_method").notNull().default("JWT"),
    isContractDefined: boolean("is_contract_defined").notNull().default(false),
    contractId: uuid("contract_id"),
  },
  (t) => [index("idx_connections_architecture_id").on(t.architectureId)],
);

// ─── Decision Lineage (D4) ─────────────────────────────────────────────────────
export const decisionLineageNodes = pgTable(
  "decision_lineage_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    architectureId: uuid("architecture_id")
      .notNull()
      .references(() => architectures.id, { onDelete: "cascade" }),
    type: lineageNodeType("type").notNull(),
    label: text("label").notNull(),
    detail: text("detail").notNull().default(""),
    sourceKind: lineageSourceKind("source_kind"),
    sourceRef: text("source_ref"),
    sourceConfidence: smallint("source_confidence"),
    serviceId: uuid("service_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_lineage_nodes_architecture_id").on(t.architectureId)],
);

export const decisionLineageEdges = pgTable(
  "decision_lineage_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    architectureId: uuid("architecture_id")
      .notNull()
      .references(() => architectures.id, { onDelete: "cascade" }),
    fromNodeId: uuid("from_node_id")
      .notNull()
      .references(() => decisionLineageNodes.id, { onDelete: "cascade" }),
    toNodeId: uuid("to_node_id")
      .notNull()
      .references(() => decisionLineageNodes.id, { onDelete: "cascade" }),
    type: lineageEdgeType("type").notNull(),
    rationale: text("rationale").notNull().default(""),
  },
  (t) => [index("idx_lineage_edges_architecture_id").on(t.architectureId)],
);

export const decisionTraces = pgTable(
  "decision_traces",
  {
    architectureId: uuid("architecture_id")
      .notNull()
      .references(() => architectures.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull(),
    traceJson: jsonb("trace_json").notNull(),
    confidence: smallint("confidence").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.architectureId, t.serviceId] })],
);

export const driftEvents = pgTable(
  "drift_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    architectureId: uuid("architecture_id")
      .notNull()
      .references(() => architectures.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    ruleId: uuid("rule_id").references(() => governanceRules.id, { onDelete: "set null" }),
    filePath: text("file_path").notNull(),
    severity: driftSeverity("severity").notNull(),
    status: driftStatus("status").notNull().default("open"),
    driftScore: integer("drift_score").notNull().default(0),
    ruleCode: text("rule_code").notNull(),
    ruleName: text("rule_name").notNull(),
    whatHappened: text("what_happened").notNull(),
    agreedContractJson: jsonb("agreed_contract_json").notNull(),
    currentViolationJson: jsonb("current_violation_json").notNull(),
    impactJson: jsonb("impact_json").notNull().default([]),
    autoFixDiffJson: jsonb("auto_fix_diff_json"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_drift_architecture_id").on(t.architectureId),
    index("idx_drift_status").on(t.status),
  ],
);

export const exceptionRequests = pgTable(
  "exception_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestedById: uuid("requested_by_id")
      .notNull()
      .references(() => users.id),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    driftEventId: uuid("drift_event_id")
      .notNull()
      .references(() => driftEvents.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => governanceRules.id),
    reason: text("reason").notNull(),
    businessJustification: text("business_justification").notNull(),
    targetResolutionDate: timestamp("target_resolution_date", { mode: "date" }).notNull(),
    status: exceptionStatus("status").notNull().default("pending"),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [index("idx_exceptions_drift_event_id").on(t.driftEventId)],
);

export const architectureExports = pgTable(
  "architecture_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    architectureId: uuid("architecture_id")
      .notNull()
      .references(() => architectures.id, { onDelete: "cascade" }),
    requestedById: uuid("requested_by_id")
      .notNull()
      .references(() => users.id),
    format: exportFormat("format").notNull(),
    content: text("content").notNull(),
    ideTarget: ideTarget("ide_target").notNull().default("cursor"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_exports_architecture_id").on(t.architectureId)],
);

export const cursorWorkspaces = pgTable(
  "cursor_workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    architectureId: uuid("architecture_id")
      .notNull()
      .references(() => architectures.id, { onDelete: "cascade" }),
    workspacePath: text("workspace_path").notNull(),
    workspaceHash: text("workspace_hash").notNull(),
    apiToken: text("api_token").notNull(),
    monitoredPaths: text("monitored_paths")
      .array()
      .notNull()
      .default(sql`'{"src/"}'`),
    ignoredPaths: text("ignored_paths")
      .array()
      .notNull()
      .default(sql`'{"node_modules/", "dist/", ".git/"}'`),
    ideTarget: ideTarget("ide_target").notNull().default("cursor"),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_workspaces_architecture_id").on(t.architectureId)],
);

export const governanceIssues = pgTable(
  "governance_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    architectureId: uuid("architecture_id")
      .notNull()
      .references(() => architectures.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => archServices.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => governanceRules.id),
    ruleCode: text("rule_code").notNull(),
    severity: ruleSeverity("severity").notNull(),
    message: text("message").notNull(),
    autoFixAvailable: boolean("auto_fix_available").notNull().default(false),
    autoFixDiffJson: jsonb("auto_fix_diff_json"),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("idx_issues_architecture_id").on(t.architectureId)],
);

// ─── Verification Pass (D8) ────────────────────────────────────────────────────
export const verificationRuns = pgTable(
  "verification_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    architectureId: uuid("architecture_id")
      .notNull()
      .references(() => architectures.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: verificationRunStatus("status").notNull().default("running"),
    trustGrade: smallint("trust_grade").notNull().default(0),
    engineVersions: jsonb("engine_versions").notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_verification_runs_architecture_id").on(t.architectureId),
    index("idx_verification_runs_org_id").on(t.organizationId),
    uniqueIndex("idx_verification_runs_one_running")
      .on(t.architectureId, t.version)
      .where(sql`status = 'running'`),
  ],
);

export const verificationFindings = pgTable(
  "verification_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => verificationRuns.id, { onDelete: "cascade" }),
    architectureId: uuid("architecture_id")
      .notNull()
      .references(() => architectures.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id"),
    lineageNodeId: uuid("lineage_node_id"),
    check: text("check").notNull(),
    tier: verificationTier("tier").notNull(),
    verdict: verificationVerdict("verdict").notNull(),
    confidence: real("confidence").notNull().default(1),
    groundTruthSource: jsonb("ground_truth_source").notNull(),
    detail: text("detail").notNull(),
    evidenceRef: text("evidence_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_verification_findings_run_id").on(t.runId),
    index("idx_verification_findings_architecture_id").on(t.architectureId),
    index("idx_verification_findings_service_id").on(t.serviceId),
  ],
);

export const verificationOverrides = pgTable(
  "verification_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => verificationFindings.id, { onDelete: "cascade" }),
    architectureId: uuid("architecture_id")
      .notNull()
      .references(() => architectures.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_verification_overrides_one_per_finding").on(t.findingId),
    index("idx_verification_overrides_architecture_id").on(t.architectureId),
  ],
);

export const schema = {
  organizations,
  users,
  governanceRulesets,
  governanceRules,
  architectures,
  interrogationSessions,
  interrogationQuestions,
  architectureCollaborators,
  auditEvents,
  archLayers,
  archServices,
  serviceConnections,
  decisionLineageNodes,
  decisionLineageEdges,
  decisionTraces,
  governanceIssues,
  verificationRuns,
  verificationFindings,
  verificationOverrides,
  driftEvents,
  exceptionRequests,
  architectureExports,
  cursorWorkspaces,
};
