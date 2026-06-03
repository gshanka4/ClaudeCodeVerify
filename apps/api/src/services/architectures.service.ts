import {
  confidenceTierFromInputs,
  connectionKindFromProtocol,
  serviceHasBlockingIssue,
  type ConfidenceTier,
  type ConnectionKind,
} from "@architectai/config";
import { EXPORTABLE_STATUS, type IdeTarget } from "@architectai/shared";
import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { recordAudit } from "@/services/audit.service";
import type { AuthContext } from "@/middleware/auth";
import {
  assertLockGateClear,
  assertVerificationCompleteForLock,
} from "@/services/verification-gate.service";
import { batchArchitectureVerificationMeta } from "@/services/export-verification.service";
import { getCompleteRunWithFindingsForVersion } from "@/services/verification.service";
import { isVerificationEnabled } from "@/lib/verification-feature";

type ArchitectureRow = typeof schema.architectures.$inferSelect;
type ArchStatus = ArchitectureRow["status"];
type EnvTarget = ArchitectureRow["environmentTarget"];

export interface ArchitectureSummaryDto {
  id: string;
  name: string;
  description: string;
  status: ArchStatus;
  version: number;
  environmentTarget: EnvTarget;
  confidenceScore: number;
  governanceScore: number;
  driftScore: number;
  tags: string[];
  totalServices: number;
  openDriftCount: number;
  collaborators: never[];
  createdAt: string;
  updatedAt: string;
  generatedAt: string | null;
  lastExportIde: IdeTarget | null;
  lastWorkspaceId: string | null;
  /** UX-D: latest activity timestamp (updatedAt or last export). */
  lastActivityAt: string;
  trustGrade: number | null;
  verificationStatus: "none" | "pending" | "running" | "complete";
}

export interface ArchServiceDto {
  id: string;
  name: string;
  displayName: string;
  category: string;
  layer: string;
  confidenceScore: number;
  status: string;
  description: string;
  rationale: string;
  alternatives: { name: string; reason: string; tradeoffs: string }[];
  position: { x: number; y: number };
  confidenceTier: ConfidenceTier;
  hasCriticalIssue: boolean;
}

export interface ArchLayerDto {
  id: string;
  type: string;
  displayName: string;
  order: number;
  confidenceScore: number;
}

export interface ServiceConnectionDto {
  id: string;
  fromServiceId: string;
  toServiceId: string;
  protocol: string;
  authMethod: string;
  isContractDefined: boolean;
  contractId: string | null;
  kind: ConnectionKind;
}

export interface GovernanceIssueDto {
  id: string;
  ruleCode: string;
  severity: string;
  message: string;
  autoFixAvailable: boolean;
  serviceId: string;
}

export interface ArchitectureDetailDto extends ArchitectureSummaryDto {
  complianceFlags: string[];
  services: ArchServiceDto[];
  layers: ArchLayerDto[];
  connections: ServiceConnectionDto[];
  governanceIssues: GovernanceIssueDto[];
}

export function toSummary(row: ArchitectureRow): ArchitectureSummaryDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    version: row.version,
    environmentTarget: row.environmentTarget,
    confidenceScore: row.confidenceScore,
    governanceScore: row.governanceScore,
    driftScore: row.driftScore,
    tags: row.tags,
    totalServices: row.totalServices,
    openDriftCount: 0, // populated by the drift engine in a later phase
    collaborators: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
    lastExportIde: null,
    lastWorkspaceId: null,
    lastActivityAt: row.updatedAt.toISOString(),
    trustGrade: null,
    verificationStatus: "none",
  };
}

export interface ListParams {
  status?: ArchStatus;
  search?: string;
  page: number;
  perPage: number;
}

export interface ListResult {
  rows: ArchitectureSummaryDto[];
  total: number;
}

/** RLS scopes every query to the caller's org, so no explicit org filter is needed. */
export async function listArchitectures(tx: AppTx, params: ListParams): Promise<ListResult> {
  const conds: SQL[] = [];
  if (params.status) conds.push(eq(schema.architectures.status, params.status));
  if (params.search && params.search.trim().length > 0) {
    conds.push(sql`${schema.architectures.name} % ${params.search}`);
  }
  const where = conds.length ? and(...conds) : undefined;

  const rows = await tx
    .select()
    .from(schema.architectures)
    .where(where)
    .orderBy(desc(schema.architectures.updatedAt))
    .limit(params.perPage)
    .offset((params.page - 1) * params.perPage);

  const [totals] = await tx
    .select({ value: count() })
    .from(schema.architectures)
    .where(where);

  const archIds = rows.map((r) => r.id);
  const lastIdeByArch = new Map<string, IdeTarget>();
  const lastExportAtByArch = new Map<string, string>();
  const lastWorkspaceByArch = new Map<string, string>();
  if (archIds.length > 0) {
    const exportRows = await tx
      .select({
        architectureId: schema.architectureExports.architectureId,
        ideTarget: schema.architectureExports.ideTarget,
        generatedAt: schema.architectureExports.generatedAt,
      })
      .from(schema.architectureExports)
      .where(inArray(schema.architectureExports.architectureId, archIds))
      .orderBy(desc(schema.architectureExports.generatedAt));
    for (const ex of exportRows) {
      if (!lastIdeByArch.has(ex.architectureId)) {
        lastIdeByArch.set(ex.architectureId, ex.ideTarget);
        lastExportAtByArch.set(ex.architectureId, ex.generatedAt.toISOString());
      }
    }

    const workspaceRows = await tx
      .select({
        architectureId: schema.cursorWorkspaces.architectureId,
        id: schema.cursorWorkspaces.id,
        createdAt: schema.cursorWorkspaces.createdAt,
      })
      .from(schema.cursorWorkspaces)
      .where(inArray(schema.cursorWorkspaces.architectureId, archIds))
      .orderBy(desc(schema.cursorWorkspaces.createdAt));
    for (const ws of workspaceRows) {
      if (!lastWorkspaceByArch.has(ws.architectureId)) {
        lastWorkspaceByArch.set(ws.architectureId, ws.id);
      }
    }
  }

  const verificationMeta = await batchArchitectureVerificationMeta(
    tx,
    rows.map((r) => ({ id: r.id, version: r.version })),
  );

  return {
    rows: rows.map((row) => {
      const summary = toSummary(row);
      const exportAt = lastExportAtByArch.get(row.id);
      const lastActivityAt =
        exportAt && exportAt > summary.updatedAt ? exportAt : summary.updatedAt;
      const verifyMeta = verificationMeta.get(row.id);
      return {
        ...summary,
        lastExportIde: lastIdeByArch.get(row.id) ?? null,
        lastWorkspaceId: lastWorkspaceByArch.get(row.id) ?? null,
        lastActivityAt,
        trustGrade: verifyMeta?.trustGrade ?? null,
        verificationStatus: verifyMeta?.verificationStatus ?? "none",
      };
    }),
    total: totals?.value ?? 0,
  };
}

export interface CreateInput {
  organizationId: string;
  createdById: string;
  name: string;
  description?: string;
  environmentTarget?: EnvTarget;
  tags?: string[];
}

export async function createArchitecture(
  tx: AppTx,
  input: CreateInput,
): Promise<ArchitectureSummaryDto> {
  const [row] = await tx
    .insert(schema.architectures)
    .values({
      organizationId: input.organizationId,
      createdById: input.createdById,
      name: input.name,
      description: input.description ?? "",
      environmentTarget: input.environmentTarget ?? "aws",
      tags: input.tags ?? [],
      status: "draft",
    })
    .returning();
  return toSummary(row!);
}

export async function getArchitecture(
  tx: AppTx,
  id: string,
): Promise<ArchitectureSummaryDto | null> {
  const [row] = await tx
    .select()
    .from(schema.architectures)
    .where(eq(schema.architectures.id, id))
    .limit(1);
  return row ? toSummary(row) : null;
}

export async function getArchitectureDetail(
  tx: AppTx,
  id: string,
): Promise<ArchitectureDetailDto | null> {
  const [row] = await tx
    .select()
    .from(schema.architectures)
    .where(eq(schema.architectures.id, id))
    .limit(1);
  if (!row) return null;

  const layers = await tx
    .select()
    .from(schema.archLayers)
    .where(eq(schema.archLayers.architectureId, id))
    .orderBy(schema.archLayers.layerOrder);

  const services = await tx
    .select()
    .from(schema.archServices)
    .where(eq(schema.archServices.architectureId, id));

  const connections = await tx
    .select()
    .from(schema.serviceConnections)
    .where(eq(schema.serviceConnections.architectureId, id));

  const issues = await tx
    .select()
    .from(schema.governanceIssues)
    .where(eq(schema.governanceIssues.architectureId, id));

  const openIssues = issues.filter((i) => i.status === "open");
  const severitiesByService = new Map<string, string[]>();
  for (const issue of openIssues) {
    const list = severitiesByService.get(issue.serviceId) ?? [];
    list.push(issue.severity);
    severitiesByService.set(issue.serviceId, list);
  }

  return {
    ...toSummary(row),
    complianceFlags: row.complianceFlags,
    layers: layers.map((l) => ({
      id: l.id,
      type: l.type,
      displayName: l.displayName,
      order: l.layerOrder,
      confidenceScore: l.confidenceScore,
    })),
    services: services.map((s) => {
      const issueSeverities = severitiesByService.get(s.id) ?? [];
      return {
        id: s.id,
        name: s.name,
        displayName: s.displayName,
        category: s.category,
        layer: s.category,
        confidenceScore: s.confidenceScore,
        status: s.status,
        description: s.description,
        rationale: s.rationale,
        alternatives: (s.alternativesJson as ArchServiceDto["alternatives"]) ?? [],
        position: { x: s.canvasX, y: s.canvasY },
        confidenceTier: confidenceTierFromInputs(s.confidenceScore, issueSeverities),
        hasCriticalIssue: serviceHasBlockingIssue(issueSeverities),
      };
    }),
    connections: connections.map((c) => ({
      id: c.id,
      fromServiceId: c.fromServiceId,
      toServiceId: c.toServiceId,
      protocol: c.protocol,
      authMethod: c.authMethod,
      isContractDefined: c.isContractDefined,
      contractId: c.contractId,
      kind: connectionKindFromProtocol(c.protocol),
    })),
    governanceIssues: issues.map((i) => ({
      id: i.id,
      ruleCode: i.ruleCode,
      severity: i.severity,
      message: i.message,
      autoFixAvailable: i.autoFixAvailable,
      serviceId: i.serviceId,
    })),
    openDriftCount: openIssues.length,
  };
}

export async function lockArchitecture(
  tx: AppTx,
  auth: AuthContext,
  architectureId: string,
): Promise<{ version: number; lockedAt: string; verificationRunId?: string }> {
  const detail = await getArchitectureDetail(tx, architectureId);
  if (!detail) throw ApiError.notFound("Architecture not found");
  if (detail.status !== EXPORTABLE_STATUS) {
    throw ApiError.conflict(
      `Architecture must be ${EXPORTABLE_STATUS} before locking (current: ${detail.status})`,
    );
  }

  let verificationRunId: string | undefined;
  if (isVerificationEnabled()) {
    const verification = await getCompleteRunWithFindingsForVersion(
      tx,
      architectureId,
      detail.version,
    );
    assertVerificationCompleteForLock(detail, verification);
    assertLockGateClear(detail, verification);
    verificationRunId = verification.run.id;
  }

  const lockedAt = new Date().toISOString();
  await recordAudit(tx, {
    organizationId: auth.organizationId,
    userId: auth.userId,
    eventType: "architecture.locked",
    resourceType: "architecture",
    resourceId: architectureId,
    payload: {
      version: detail.version,
      snapshot: detail,
      lockedAt,
      ...(verificationRunId ? { verificationRunId } : {}),
    },
  });

  return { version: detail.version, lockedAt, verificationRunId };
}

export async function getLockedVersionSnapshot(
  tx: AppTx,
  architectureId: string,
  version: number,
): Promise<{ snapshot: ArchitectureDetailDto; verificationRunId?: string } | null> {
  const events = await tx
    .select()
    .from(schema.auditEvents)
    .where(
      and(
        eq(schema.auditEvents.resourceId, architectureId),
        eq(schema.auditEvents.eventType, "architecture.locked"),
      ),
    )
    .orderBy(desc(schema.auditEvents.occurredAt));

  for (const ev of events) {
    const payload = ev.payloadJson as {
      version?: number;
      snapshot?: ArchitectureDetailDto;
      verificationRunId?: string;
    };
    if (payload.version === version && payload.snapshot) {
      return { snapshot: payload.snapshot, verificationRunId: payload.verificationRunId };
    }
  }
  return null;
}

export interface UpdateInput {
  name?: string;
  description?: string;
  tags?: string[];
}

export async function updateArchitecture(
  tx: AppTx,
  id: string,
  input: UpdateInput,
): Promise<ArchitectureSummaryDto | null> {
  const patch: Partial<typeof schema.architectures.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (Object.keys(patch).length === 0) return getArchitecture(tx, id);

  const [current] = await tx
    .select({ version: schema.architectures.version })
    .from(schema.architectures)
    .where(eq(schema.architectures.id, id))
    .limit(1);
  if (!current) return null;

  const [locked] = await tx
    .select({ id: schema.auditEvents.id })
    .from(schema.auditEvents)
    .where(
      and(
        eq(schema.auditEvents.resourceId, id),
        eq(schema.auditEvents.eventType, "architecture.locked"),
      ),
    )
    .limit(1);
  if (locked) patch.version = current.version + 1;

  const [row] = await tx
    .update(schema.architectures)
    .set(patch)
    .where(eq(schema.architectures.id, id))
    .returning();
  return row ? toSummary(row) : null;
}

/** Soft-delete = archive. Returns false when the id isn't visible to this tenant. */
export async function archiveArchitecture(tx: AppTx, id: string): Promise<boolean> {
  const rows = await tx
    .update(schema.architectures)
    .set({ status: "archived" })
    .where(eq(schema.architectures.id, id))
    .returning({ id: schema.architectures.id });
  return rows.length > 0;
}
