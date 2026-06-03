import type {
  AnswerQuestionResponse,
  ArchitectureLineage,
  AskArchitectureResponse,
  DecisionChainResponse,
  DecisionLineageChatResponse,
  ExportIdeHandoffResponse,
  HandoffSessionStatus,
  IdeHandoffResponse,
  IdeTarget,
  InterrogationQuestion,
  InterrogationSession,
  InterrogationSessionSummary,
  LineageTopicsResponse,
  LockArchitectureResponse,
  RecordVerificationOverrideRequest,
  ResolvedDecisionTrace,
  GenerationJobStatus,
  StartGenerationResponse,
  StartInterrogationResponse,
  StartVerificationResponse,
  VerificationFinding,
  VerificationGateConflict,
  VerificationSummary,
} from "@architectai/shared";
import { apiUrl } from "@/lib/api-base";
import { getDevClerkId } from "@/lib/auth-session";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

/** Lock gate failure — unresolved deterministic conflicts on critical components. */
export class VerificationGateApiError extends ApiClientError {
  constructor(
    status: number,
    message: string,
    public readonly conflicts: VerificationGateConflict[],
  ) {
    super(status, "verification_gate_failed", message);
    this.name = "VerificationGateApiError";
  }
}

function getAuthToken(): string | null {
  return getDevClerkId();
}

/** Clerk injects the token via `setApiTokenGetter` when available. */
let tokenGetter: (() => Promise<string | null>) | null = null;

export function setApiTokenGetter(getter: () => Promise<string | null>): void {
  tokenGetter = getter;
}

async function resolveToken(): Promise<string | null> {
  if (tokenGetter) {
    const t = await tokenGetter();
    if (t) return t;
  }
  return getAuthToken();
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await resolveToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(apiUrl(path), { ...init, headers });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      body.code ?? "error",
      body.message ?? res.statusText,
    );
  }
  return body as T;
}

export interface StartInterrogationPayload {
  prompt: string;
  importType?: "jira" | "prd" | "swagger" | "text";
}

export async function startInterrogation(
  payload: StartInterrogationPayload,
): Promise<StartInterrogationResponse & { sessionId: string }> {
  const res = await request<{ data: StartInterrogationResponse & { sessionId: string } }>(
    "/api/interrogate/start",
    { method: "POST", body: JSON.stringify(payload) },
  );
  return res.data;
}

export async function getInterrogationSession(sessionId: string): Promise<InterrogationSession> {
  const res = await request<{ data: InterrogationSession }>(`/api/interrogate/${sessionId}`);
  return res.data;
}

export async function listInterrogationSessions(input?: {
  status?: "active" | "complete";
  limit?: number;
}): Promise<InterrogationSessionSummary[]> {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.limit) params.set("limit", String(input.limit));
  const qs = params.toString();
  const res = await request<{ data: { sessions: InterrogationSessionSummary[] } }>(
    `/api/interrogate/sessions${qs ? `?${qs}` : ""}`,
  );
  return res.data.sessions;
}

export async function answerQuestion(
  sessionId: string,
  body: { questionId: string; selectedOptionId?: string; freeformAnswer?: string },
): Promise<AnswerQuestionResponse & { sessionComplete?: boolean }> {
  const res = await request<{
    data: AnswerQuestionResponse & { sessionComplete?: boolean };
  }>(`/api/interrogate/${sessionId}/answer`, { method: "POST", body: JSON.stringify(body) });
  return res.data;
}

export async function skipQuestion(
  sessionId: string,
  questionId: string,
): Promise<{
  nextQuestion: InterrogationQuestion | null;
  canGenerate: boolean;
  sessionComplete?: boolean;
}> {
  const res = await request<{
    data: {
      nextQuestion: InterrogationQuestion | null;
      canGenerate: boolean;
      sessionComplete?: boolean;
    };
  }>(`/api/interrogate/${sessionId}/skip`, {
    method: "POST",
    body: JSON.stringify({ questionId }),
  });
  return res.data;
}

export async function editQuestion(
  sessionId: string,
  questionId: string,
  body: { selectedOptionId?: string; freeformAnswer?: string },
): Promise<{
  updatedProgress: { contextGathering: number; governanceCoverage: number };
  questions: InterrogationQuestion[];
}> {
  const res = await request<{
    data: {
      updatedProgress: { contextGathering: number; governanceCoverage: number };
      questions: InterrogationQuestion[];
    };
  }>(`/api/interrogate/${sessionId}/edit/${questionId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function startGeneration(
  sessionId: string,
  opts?: { slowMode?: boolean },
): Promise<StartGenerationResponse> {
  const token = await resolveToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiUrl("/api/generate/start"), {
    method: "POST",
    headers,
    body: JSON.stringify({ sessionId, slowMode: opts?.slowMode }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      body.code ?? "error",
      body.message ?? res.statusText,
    );
  }
  const parsed = body as { data: StartGenerationResponse };
  return parsed.data;
}

export async function getGenerationJobStatus(
  architectureId: string,
): Promise<GenerationJobStatus> {
  const res = await request<{ data: GenerationJobStatus }>(
    `/api/generate/jobs/${architectureId}/status`,
  );
  return res.data;
}

export async function cancelGeneration(
  architectureId: string,
): Promise<{ cancelled: boolean; reason?: string }> {
  const res = await request<{ data: { cancelled: boolean; reason?: string } }>(
    `/api/generate/${architectureId}/cancel`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return res.data;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await resolveToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ArchitectureDetailResponse {
  id: string;
  name: string;
  description: string;
  status: string;
  version: number;
  confidenceScore: number;
  governanceScore: number;
  driftScore: number;
  complianceFlags: string[];
  services: {
    id: string;
    name: string;
    displayName: string;
    layer: string;
    confidenceScore: number;
    confidenceTier?: "high" | "partial" | "critical";
    hasCriticalIssue?: boolean;
    status: string;
    position: { x: number; y: number };
  }[];
  layers: { id: string; type: string; displayName: string; order: number }[];
  connections: {
    id: string;
    fromServiceId: string;
    toServiceId: string;
    protocol: string;
    kind?: "sync" | "async" | "event" | "dependency";
  }[];
  governanceIssues: {
    id: string;
    ruleCode: string;
    severity: string;
    message: string;
    serviceId: string;
  }[];
}

export async function getArchitectureDetail(
  architectureId: string,
): Promise<ArchitectureDetailResponse> {
  const res = await request<{ data: ArchitectureDetailResponse }>(
    `/api/architectures/${architectureId}`,
  );
  return res.data;
}

export async function getArchitectureLineage(
  architectureId: string,
): Promise<ArchitectureLineage> {
  const res = await request<{ data: ArchitectureLineage }>(
    `/api/architectures/${architectureId}/lineage`,
  );
  return res.data;
}

export async function getServiceTrace(
  architectureId: string,
  serviceId: string,
): Promise<ResolvedDecisionTrace> {
  const res = await request<{ data: ResolvedDecisionTrace }>(
    `/api/architectures/${architectureId}/services/${serviceId}/trace`,
  );
  return res.data;
}

export async function getLineageTopics(
  architectureId: string,
  serviceId?: string | null,
): Promise<LineageTopicsResponse> {
  const q = serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : "";
  const res = await request<{ data: LineageTopicsResponse }>(
    `/api/architectures/${architectureId}/lineage/topics${q}`,
  );
  return res.data;
}

export async function getDecisionChain(
  architectureId: string,
  topicId: string,
): Promise<DecisionChainResponse> {
  const res = await request<{ data: DecisionChainResponse }>(
    `/api/architectures/${architectureId}/lineage/decisions/${topicId}`,
  );
  return res.data;
}

export async function decisionLineageChat(
  architectureId: string,
  serviceId: string,
  message: string,
): Promise<DecisionLineageChatResponse> {
  const res = await request<{ data: DecisionLineageChatResponse }>(
    `/api/architectures/${architectureId}/services/${serviceId}/decision-chat`,
    { method: "POST", body: JSON.stringify({ message }) },
  );
  return res.data;
}

export async function lockArchitecture(
  architectureId: string,
): Promise<LockArchitectureResponse> {
  const token = await resolveToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(apiUrl(`/api/architectures/${architectureId}/lock`), {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const gate = body.error as
      | { code: string; message: string; conflicts?: VerificationGateConflict[] }
      | undefined;
    if (gate?.code === "verification_gate_failed" && gate.conflicts) {
      throw new VerificationGateApiError(res.status, gate.message, gate.conflicts);
    }
    throw new ApiClientError(
      res.status,
      body.code ?? "error",
      body.message ?? res.statusText,
    );
  }
  return (body as { data: LockArchitectureResponse }).data;
}

export async function triggerVerification(
  architectureId: string,
  opts?: { force?: boolean },
): Promise<StartVerificationResponse> {
  const q = opts?.force ? "?force=true" : "";
  const res = await request<{ data: StartVerificationResponse }>(
    `/api/architectures/${architectureId}/verify${q}`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return res.data;
}

export async function getVerificationSummary(
  architectureId: string,
): Promise<VerificationSummary> {
  const res = await request<{ data: VerificationSummary }>(
    `/api/architectures/${architectureId}/verification`,
  );
  return res.data;
}

export async function getComponentVerification(
  architectureId: string,
  serviceId: string,
): Promise<{ run: VerificationSummary["run"]; findings: VerificationFinding[] }> {
  const res = await request<{
    data: { run: VerificationSummary["run"]; findings: VerificationFinding[] };
  }>(`/api/architectures/${architectureId}/services/${serviceId}/verification`);
  return res.data;
}

export async function recordFindingOverride(
  architectureId: string,
  findingId: string,
  body: RecordVerificationOverrideRequest,
): Promise<{ override: VerificationSummary["overrides"][number]; trustGrade: VerificationSummary["trustGrade"] }> {
  const res = await request<{
    data: {
      override: VerificationSummary["overrides"][number];
      trustGrade: VerificationSummary["trustGrade"];
    };
  }>(`/api/architectures/${architectureId}/findings/${findingId}/override`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function askArchitecture(
  architectureId: string,
  question: string,
): Promise<AskArchitectureResponse> {
  const res = await request<{ data: AskArchitectureResponse }>(
    `/api/architectures/${architectureId}/ask`,
    { method: "POST", body: JSON.stringify({ question }) },
  );
  return res.data;
}

export interface ArchitectureSummary {
  id: string;
  name: string;
  description: string;
  status: string;
  version: number;
  confidenceScore: number;
  governanceScore: number;
  driftScore: number;
  openDriftCount: number;
  environmentTarget: string;
  totalServices: number;
  updatedAt: string;
  lastActivityAt: string;
  lastExportIde?: IdeTarget | null;
  lastWorkspaceId?: string | null;
  trustGrade?: number | null;
  verificationStatus?: "none" | "pending" | "running" | "complete";
}

export async function requestExportIdeHandoff(
  architectureId: string,
  ide: IdeTarget = "claude-code",
): Promise<ExportIdeHandoffResponse> {
  const res = await request<{ data: ExportIdeHandoffResponse }>(
    `/api/architectures/${architectureId}/export/ide-handoff`,
    { method: "POST", body: JSON.stringify({ ide }) },
  );
  return res.data;
}

export async function getHandoffSessionStatus(
  architectureId: string,
  sessionId: string,
): Promise<HandoffSessionStatus> {
  const res = await request<{ data: HandoffSessionStatus }>(
    `/api/architectures/${architectureId}/export/handoff-session/${sessionId}`,
  );
  return res.data;
}

export async function reportHandoffSession(
  architectureId: string,
  sessionId: string,
  phase: "workspace_linked" | "ide_opened" | "failed",
): Promise<HandoffSessionStatus> {
  const res = await request<{ data: HandoffSessionStatus }>(
    `/api/architectures/${architectureId}/export/handoff-session/${sessionId}/report`,
    { method: "POST", body: JSON.stringify({ phase }) },
  );
  return res.data;
}

export async function fetchIdeHandoff(
  architectureId: string,
  ide?: IdeTarget,
): Promise<IdeHandoffResponse> {
  const q = ide ? `?ide=${encodeURIComponent(ide)}` : "";
  const res = await request<{ data: IdeHandoffResponse }>(
    `/api/architectures/${architectureId}/ide-handoff${q}`,
  );
  return res.data;
}

export async function listArchitectures(): Promise<{
  rows: ArchitectureSummary[];
  total: number;
}> {
  const res = await request<{
    data: ArchitectureSummary[];
    meta?: { total: number };
  }>("/api/architectures");
  return { rows: res.data, total: res.meta?.total ?? res.data.length };
}

export type MvpExportFormat =
  | "claude-code-bundle"
  | "cursor-config"
  | "openapi"
  | "adr-markdown";

export async function exportArchitecture(
  architectureId: string,
  format: MvpExportFormat,
  ideTarget: IdeTarget = "claude-code",
): Promise<{
  format: string;
  content: string;
  filename: string;
  version: number;
}> {
  const res = await request<{
    data: { format: string; content: string; filename: string; version: number };
  }>(`/api/architectures/${architectureId}/export`, {
    method: "POST",
    body: JSON.stringify({ format, ideTarget }),
  });
  return res.data;
}

export interface CursorConfigResponse {
  architectureId: string;
  organizationId: string;
  architectureName: string;
  apiToken: string;
  driftCheckEndpoint: string;
  wsEndpoint: string;
  monitoredPaths: string[];
  ignoredPaths: string[];
}

export async function registerCursorWorkspace(body: {
  architectureId: string;
  workspacePath: string;
  monitoredPaths?: string[];
  ignoredPaths?: string[];
  ideTarget?: IdeTarget;
}): Promise<{
  workspaceId: string;
  apiToken: string;
  cursorConfig: CursorConfigResponse;
}> {
  const res = await request<{
    data: {
      workspaceId: string;
      apiToken: string;
      cursorConfig: CursorConfigResponse;
    };
  }>("/api/cursor/workspaces", { method: "POST", body: JSON.stringify(body) });
  return res.data;
}
