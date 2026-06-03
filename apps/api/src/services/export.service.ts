import { EXPORTABLE_STATUS, type IdeTarget } from "@architectai/shared";
import { and, desc, eq } from "drizzle-orm";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import type { ExportFormat } from "@/export/types";
import { assertMvpFormat, renderExport } from "@/export/render";
import { InlineExportStorage, type ExportStorage } from "@/export/storage";
import { toGovernanceRules } from "@/engine/evaluate";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/middleware/auth";
import {
  getArchitectureDetail,
  lockArchitecture,
  type ArchitectureDetailDto,
} from "@/services/architectures.service";
import { assertExportVerificationReady } from "@/services/export-verification.service";
import { recordAudit } from "@/services/audit.service";
import { isVerificationEnabled } from "@/lib/verification-feature";

async function getLatestLockBaseline(
  tx: AppTx,
  architectureId: string,
): Promise<{
  snapshot: ArchitectureDetailDto;
  version: number;
  verificationRunId?: string;
} | null> {
  const [ev] = await tx
    .select()
    .from(schema.auditEvents)
    .where(
      and(
        eq(schema.auditEvents.resourceId, architectureId),
        eq(schema.auditEvents.eventType, "architecture.locked"),
      ),
    )
    .orderBy(desc(schema.auditEvents.occurredAt))
    .limit(1);
  if (!ev) return null;
  const payload = ev.payloadJson as {
    version?: number;
    snapshot?: ArchitectureDetailDto;
    verificationRunId?: string;
  };
  if (!payload.snapshot || payload.version == null) return null;
  return {
    snapshot: payload.snapshot,
    version: payload.version,
    verificationRunId: payload.verificationRunId,
  };
}

async function loadRules(tx: AppTx, detail: ArchitectureDetailDto) {
  const [arch] = await tx
    .select({ rulesetId: schema.architectures.rulesetId, organizationId: schema.architectures.organizationId })
    .from(schema.architectures)
    .where(eq(schema.architectures.id, detail.id))
    .limit(1);
  if (!arch) return [];

  let rulesetId = arch.rulesetId;
  if (!rulesetId) {
    const [rs] = await tx
      .select({ id: schema.governanceRulesets.id })
      .from(schema.governanceRulesets)
      .where(
        and(
          eq(schema.governanceRulesets.organizationId, arch.organizationId),
          eq(schema.governanceRulesets.isDefault, true),
        ),
      )
      .limit(1);
    rulesetId = rs?.id ?? null;
  }
  if (!rulesetId) return [];

  const rows = await tx
    .select()
    .from(schema.governanceRules)
    .where(eq(schema.governanceRules.rulesetId, rulesetId));
  return toGovernanceRules(rows);
}

export interface ExportResult {
  exportId: string;
  format: ExportFormat;
  content: string;
  filename: string;
  version: number;
  bundleKeys: string[];
  isReexport: boolean;
}

export async function exportArchitecture(
  tx: AppTx,
  auth: AuthContext,
  architectureId: string,
  format: string,
  ideTarget: IdeTarget = "claude-code",
  storage: ExportStorage = new InlineExportStorage(),
): Promise<ExportResult> {
  assertMvpFormat(format);

  const detail = await getArchitectureDetail(tx, architectureId);
  if (!detail) throw ApiError.notFound("Architecture not found");
  if (detail.status !== EXPORTABLE_STATUS) {
    throw ApiError.conflict(
      `Architecture must be ${EXPORTABLE_STATUS} to export (current: ${detail.status})`,
    );
  }

  let baseline = await getLatestLockBaseline(tx, architectureId);
  if (!baseline) {
    await lockArchitecture(tx, auth, architectureId);
    baseline = await getLatestLockBaseline(tx, architectureId);
    if (!baseline) {
      throw ApiError.internal("Failed to establish export lock baseline");
    }
  }
  const exportDetail = baseline.snapshot;
  const lockedVersion = baseline.version;

  const verificationStamp = isVerificationEnabled()
    ? await assertExportVerificationReady(
        tx,
        architectureId,
        lockedVersion,
        baseline.verificationRunId,
      )
    : undefined;

  const rules = await loadRules(tx, exportDetail);
  const rendered = renderExport(format, {
    detail: exportDetail,
    rules,
    lockedVersion,
    organizationId: auth.organizationId,
    verificationStamp,
  });

  try {
    await storage.persist(`${architectureId}:${format}`, rendered.content);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.internal("Export failed");
  }

  const [prev] = await tx
    .select({ id: schema.architectureExports.id })
    .from(schema.architectureExports)
    .where(eq(schema.architectureExports.architectureId, architectureId))
    .limit(1);

  const [row] = await tx
    .insert(schema.architectureExports)
    .values({
      architectureId,
      requestedById: auth.userId,
      format: rendered.format,
      content: rendered.content,
      ideTarget,
    })
    .returning();

  await recordAudit(tx, {
    organizationId: auth.organizationId,
    userId: auth.userId,
    eventType: "architecture.exported",
    resourceType: "architecture",
    resourceId: architectureId,
    payload: { format, version: lockedVersion, exportId: row!.id, ideTarget },
  });

  return {
    exportId: row!.id,
    format: rendered.format,
    content: rendered.content,
    filename: rendered.filename,
    version: lockedVersion,
    bundleKeys: [
      "manifest",
      "rules",
      "boundaries",
      "forbiddenPatterns",
      "contracts",
    ],
    isReexport: Boolean(prev),
  };
}
