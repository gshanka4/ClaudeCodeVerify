/**
 * ArchitectAI — Complete TypeScript Data Model (canonical)
 *
 * Mirror of `docs/02_ARCHITECTAI_DATA_MODEL.ts`. This is the single source of
 * truth for domain types across web, api, workers, and the extension.
 *
 * Decision Lineage types (spec delta D3) live in `./lineage`. The `lineage`
 * SSE event (D6) and `architecture.locked` audit event (D2) are wired below.
 */
import type { DecisionTrace, LineageEdge, LineageNode } from "./lineage";

// ─── 1. Identity & Auth ───────────────────────────────────────────────────────

export type UserRole = "owner" | "architect" | "developer" | "governance_lead" | "viewer";

export interface User {
  id: string;
  clerkId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  organizationId: string;
  role: UserRole;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface Session {
  userId: string;
  organizationId: string;
  role: UserRole;
  expiresAt: Date;
}

// ─── 2. Organizations & Teams ─────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  plan: "starter" | "growth" | "enterprise";
  region: "us-east-1" | "eu-west-1" | "ap-southeast-1";
  ssoEnabled: boolean;
  ssoProvider: "saml" | "okta" | "azure-ad" | null;
  createdAt: Date;
  settings: OrganizationSettings;
}

export interface OrganizationSettings {
  driftNotificationsEnabled: boolean;
  slackWebhookUrl: string | null;
  githubOrg: string | null;
  defaultGovernanceRulesetId: string | null;
  requireExceptionApproval: boolean;
  retentionDays: number;
}

// ─── 3. Architecture & Services ───────────────────────────────────────────────

export type ArchitectureStatus = "interrogating" | "generating" | "ready" | "draft" | "archived";
export type EnvironmentTarget = "aws" | "gcp" | "azure" | "on-prem" | "multi-cloud";

export interface Architecture {
  id: string;
  organizationId: string;
  createdById: string;
  name: string;
  description: string;
  status: ArchitectureStatus;
  version: number;
  environmentTarget: EnvironmentTarget;
  confidenceScore: number;
  governanceScore: number;
  aiTrustScore: number;
  driftScore: number;
  services: ArchService[];
  layers: ArchLayer[];
  connections: ServiceConnection[];
  tags: string[];
  metadata: ArchitectureMetadata;
  generatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ArchitectureMetadata {
  inputPrompt: string;
  interrogationSessionId: string;
  governanceRulesetId: string;
  totalServices: number;
  totalConnections: number;
  complianceFlags: string[];
  estimatedMonthlyInfraUsd: number | null;
  adrCount: number;
  openApiSpecCount: number;
}

export type LayerType =
  | "gateway"
  | "security"
  | "services"
  | "cache"
  | "messaging"
  | "database"
  | "ml"
  | "storage"
  | "observability";

export interface ArchLayer {
  id: string;
  type: LayerType;
  displayName: string;
  order: number;
  services: string[];
  confidenceScore: number;
}

export type ServiceStatus = "done" | "active" | "pending" | "warning" | "error";
export type ServiceCategory = LayerType;

export interface ArchService {
  id: string;
  architectureId: string;
  name: string;
  displayName: string;
  category: ServiceCategory;
  layer: LayerType;
  confidenceScore: number;
  status: ServiceStatus;
  description: string;
  rationale: string;
  alternatives: ServiceAlternative[];
  governanceIssues: GovernanceIssue[];
  contracts: ServiceContract[];
  position: { x: number; y: number };
  metadata: Record<string, unknown>;
}

export interface ServiceAlternative {
  name: string;
  reason: string;
  tradeoffs: string;
}

export interface ServiceConnection {
  id: string;
  fromServiceId: string;
  toServiceId: string;
  protocol: "REST" | "gRPC" | "Kafka" | "WebSocket" | "AMQP" | "internal";
  authMethod: "mTLS" | "JWT" | "API-key" | "OAuth2-CC" | "none";
  isContractDefined: boolean;
  contractId: string | null;
}

// ─── 4. Interrogation Sessions ────────────────────────────────────────────────

export type QuestionCategory =
  | "scale"
  | "security"
  | "compliance"
  | "cloud"
  | "data"
  | "messaging"
  | "deployment"
  | "migration";

export type QuestionStatus = "pending" | "answered" | "skipped";

export type LinkedArchitectureStatus = "draft" | "generating" | "ready";

export interface InterrogationSession {
  id: string;
  organizationId: string;
  userId: string;
  architectureId: string | null;
  /** Present when architectureId is set — used to resume overlay or allow draft retry. */
  linkedArchitectureStatus?: LinkedArchitectureStatus | null;
  initialPrompt: string;
  status: "active" | "complete" | "abandoned";
  contextGatheringProgress: number;
  governanceCoverageProgress: number;
  questions: InterrogationQuestion[];
  currentQuestionIndex: number;
  createdAt: Date;
  completedAt: Date | null;
}

/** UX-B: resume list item from GET /api/interrogate/sessions */
export interface InterrogationSessionSummary {
  sessionId: string;
  initialPrompt: string;
  answeredCount: number;
  maxQuestions: number;
  status: "active" | "complete";
  architectureId: string | null;
  updatedAt: string;
}

export interface InterrogationQuestion {
  id: string;
  sessionId: string;
  index: number;
  category: QuestionCategory;
  status: QuestionStatus;
  questionText: string;
  warningContext: QuestionWarning | null;
  options: QuestionOption[];
  selectedOptionId: string | null;
  freeformAnswer: string | null;
  confidenceImpact: number;
  answeredAt: Date | null;
}

export interface QuestionWarning {
  level: "low" | "medium" | "critical";
  message: string;
  affectedPaths: string[];
}

export interface QuestionOption {
  id: string;
  label: string;
  description: string;
  badge: "AI Recommended" | "Common Choice" | "Enterprise Grade" | null;
  badgeVariant: "violet" | "emerald" | "amber" | null;
  keyboardHint: 1 | 2 | 3 | 4;
}

// ─── 5. Governance & Rules ────────────────────────────────────────────────────

export type RuleType = "boundary" | "auth" | "pattern" | "naming" | "contract" | "dependency";
export type RuleSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface GovernanceRuleset {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  version: string;
  rules: GovernanceRule[];
  isDefault: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GovernanceRule {
  id: string;
  rulesetId: string;
  code: string;
  type: RuleType;
  severity: RuleSeverity;
  name: string;
  description: string;
  rationale: string;
  condition: RuleCondition;
  autoFixStrategy: AutoFixStrategy | null;
  enabled: boolean;
}

export interface RuleCondition {
  forbiddenFrom?: string;
  forbiddenTo?: string;
  requiredAuth?: string;
  forbiddenPattern?: string;
  forbiddenImportPath?: string;
  contractId?: string;
}

export interface AutoFixStrategy {
  type: "import-replace" | "add-layer" | "rename" | "add-auth-header";
  description: string;
  diffTemplate: string;
}

export interface GovernanceIssue {
  id: string;
  ruleId: string;
  ruleCode: string;
  severity: RuleSeverity;
  serviceId: string;
  message: string;
  autoFixAvailable: boolean;
  autoFixDiff: CodeDiff | null;
  status: "open" | "auto-fixed" | "exception-approved" | "ignored";
}

export interface CodeDiff {
  filePath: string;
  linesChanged: number;
  driftScoreDelta: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  lineStart: number;
  removed: string[];
  added: string[];
}

// ─── 6. Drift Detection ───────────────────────────────────────────────────────

export type DriftSeverity = "critical" | "high" | "medium" | "low";
export type DriftStatus =
  | "open"
  | "ignored"
  | "auto-fixed"
  | "exception-pending"
  | "exception-approved";

export interface DriftEvent {
  id: string;
  organizationId: string;
  architectureId: string;
  userId: string;
  filePath: string;
  severity: DriftSeverity;
  status: DriftStatus;
  driftScore: number;
  ruleCode: string;
  ruleName: string;
  whatHappened: string;
  agreedContract: ContractDiagram;
  currentViolation: ContractDiagram;
  impact: DriftImpact[];
  autoFix: CodeDiff | null;
  detectedAt: Date;
  resolvedAt: Date | null;
}

export interface ContractDiagram {
  steps: ContractStep[];
  label: string;
}

export interface ContractStep {
  from: string;
  to: string;
  isViolation?: boolean;
}

export interface DriftImpact {
  type: "security" | "contract" | "compliance" | "performance";
  description: string;
  iconType: "lock" | "file-text" | "shield-alert" | "zap";
}

// ─── 7. Contracts & Exports ───────────────────────────────────────────────────

export interface ServiceContract {
  id: string;
  architectureId: string;
  serviceId: string;
  name: string;
  version: string;
  openApiSpec: string;
  endpoints: ContractEndpoint[];
  isEnforced: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContractEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  requestSchema: Record<string, unknown> | null;
  responseSchema: Record<string, unknown>;
  authRequired: boolean;
  authMethod: string | null;
}

export interface ArchitectureExport {
  id: string;
  architectureId: string;
  format:
    | "terraform"
    | "pulumi"
    | "openapi"
    | "adr-markdown"
    | "claude-code-bundle"
    | "cursor-config";
  content: string;
  generatedAt: Date;
}

export interface CursorConfig {
  architectureId: string;
  organizationId: string;
  architectureName: string;
  governanceRules: Pick<
    GovernanceRule,
    "id" | "code" | "type" | "severity" | "condition" | "autoFixStrategy"
  >[];
  monitoredPaths: string[];
  ignoredPaths: string[];
  driftCheckEndpoint: string;
  wsEndpoint: string;
  apiToken: string;
}

// ─── 8. Audit & Exceptions ────────────────────────────────────────────────────

export type AuditEventType =
  | "architecture.created"
  | "architecture.updated"
  | "architecture.archived"
  | "architecture.generated"
  | "architecture.locked" // spec delta D2 — Workspace Lock action
  | "architecture.verified" // spec delta D8 — Verification Pass complete
  | "architecture.override_recorded" // spec delta D8 — Lock gate override
  | "architecture.exported"
  | "interrogation.started"
  | "interrogation.question.answered"
  | "interrogation.question.skipped"
  | "drift.detected"
  | "drift.auto-fixed"
  | "drift.ignored"
  | "exception.requested"
  | "exception.approved"
  | "exception.denied"
  | "governance.ruleset.created"
  | "governance.rule.created"
  | "governance.rule.updated"
  | "cursor.workspace.connected"
  | "user.invited"
  | "user.role.changed";

export interface AuditEvent {
  id: string;
  organizationId: string;
  userId: string;
  eventType: AuditEventType;
  resourceType: string;
  resourceId: string;
  payload: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  occurredAt: Date;
}

export type ExceptionStatus = "pending" | "approved" | "denied" | "expired";

export interface ExceptionRequest {
  id: string;
  organizationId: string;
  requestedById: string;
  reviewedById: string | null;
  driftEventId: string;
  ruleId: string;
  reason: string;
  businessJustification: string;
  targetResolutionDate: Date;
  status: ExceptionStatus;
  reviewNotes: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  expiresAt: Date | null;
}

// ─── 9. API Request / Response Types ─────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    perPage?: number;
    cursor?: string;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface StartInterrogationRequest {
  prompt: string;
  importType?: "jira" | "prd" | "swagger" | "text";
  importUrl?: string;
}
export interface StartInterrogationResponse {
  sessionId: string;
  firstQuestion: InterrogationQuestion;
}

export interface AnswerQuestionRequest {
  questionId: string;
  selectedOptionId?: string;
  freeformAnswer?: string;
}
export interface AnswerQuestionResponse {
  nextQuestion: InterrogationQuestion | null;
  sessionProgress: {
    contextGathering: number;
    governanceCoverage: number;
    questionsRemaining: number;
  };
  canGenerate: boolean;
}

export interface StartGenerationRequest {
  sessionId: string;
}
export interface StartGenerationResponse {
  architectureId: string;
  streamUrl: string;
}

export interface DriftCheckRequest {
  architectureId: string;
  filePath: string;
  fileContent: string;
  diffHunks?: DiffHunk[];
}
export interface DriftCheckResponse {
  hasDrift: boolean;
  drifts: DriftEvent[];
  newDriftScore: number;
}

export interface ExceptionRequestPayload {
  driftEventId: string;
  reason: string;
  businessJustification: string;
  targetResolutionDate: string;
}

// ─── 10. WebSocket / SSE Event Types ─────────────────────────────────────────

export type GenerationStreamEvent =
  | { type: "node"; payload: GenerationNodeEvent }
  | { type: "governance"; payload: GenerationGovernanceEvent }
  | { type: "lineage"; payload: GenerationLineageEvent } // spec delta D6
  | { type: "progress"; payload: GenerationProgressEvent }
  | { type: "complete"; payload: GenerationCompleteEvent }
  | { type: "error"; payload: { message: string } };

/** Streams Decision Lineage (Provenance Engine) alongside `node` events. */
export interface GenerationLineageEvent {
  nodes: LineageNode[];
  edges: LineageEdge[];
  trace: DecisionTrace;
}

export interface GenerationNodeEvent {
  serviceId: string;
  name: string;
  layer: LayerType;
  status: "active" | "done";
  confidenceScore: number;
  icon: string;
}

export interface GenerationGovernanceEvent {
  checkText: string;
  done: boolean;
}

/** UX-A: phased progress labels on the generation overlay. */
export type GenerationPhase =
  | "requirements"
  | "services"
  | "contracts"
  | "governance"
  | "finalizing";

export interface GenerationProgressEvent {
  progress: number;
  confidenceScore: number;
  governanceScore: number;
  aiTrustScore: number;
  nodesGenerated: number;
  totalNodes: number;
  estimatedSecondsRemaining: number;
  phase?: GenerationPhase;
  phaseLabel?: string;
}

/** UX-A: recovery polling after SSE disconnect or page refresh. */
export interface GenerationJobStatus {
  architectureId: string;
  status: "running" | "complete" | "failed" | "cancelled";
  lastEventId: number;
  progress: GenerationProgressEvent | null;
  error: string | null;
}

export interface GenerationCompleteEvent {
  architectureId: string;
  finalConfidenceScore: number;
  finalGovernanceScore: number;
  totalServices: number;
  totalGovernanceRulesApplied: number;
  criticalIssueCount: number;
  workspaceUrl: string;
}

export type CursorWsMessage =
  | { type: "drift.detected"; payload: DriftEvent }
  | { type: "drift.resolved"; payload: { driftId: string } }
  | { type: "architecture.updated"; payload: { architectureId: string; version: number } }
  | { type: "ping" }
  | { type: "pong" };
