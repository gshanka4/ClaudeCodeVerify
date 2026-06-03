import type {
  GroundTruthSource,
  VerificationCheck,
  VerificationFinding,
  VerificationOverride,
  VerificationRun,
} from "@architectai/shared";
import { schema } from "@/db/schema";

type RunRow = typeof schema.verificationRuns.$inferSelect;
type FindingRow = typeof schema.verificationFindings.$inferSelect;
type OverrideRow = typeof schema.verificationOverrides.$inferSelect;

export function toVerificationRunDto(row: RunRow): VerificationRun {
  return {
    id: row.id,
    architectureId: row.architectureId,
    version: row.version,
    status: row.status,
    trustGrade: row.trustGrade,
    engineVersions: row.engineVersions as Record<string, string>,
    startedAt: row.startedAt.toISOString(),
    ...(row.finishedAt ? { finishedAt: row.finishedAt.toISOString() } : {}),
  };
}

export function toVerificationFindingDto(row: FindingRow): VerificationFinding {
  return {
    id: row.id,
    runId: row.runId,
    architectureId: row.architectureId,
    ...(row.serviceId ? { serviceId: row.serviceId } : {}),
    ...(row.lineageNodeId ? { lineageNodeId: row.lineageNodeId } : {}),
    check: row.check as VerificationCheck,
    tier: row.tier,
    verdict: row.verdict,
    confidence: row.confidence,
    groundTruthSource: row.groundTruthSource as GroundTruthSource,
    detail: row.detail,
    ...(row.evidenceRef ? { evidenceRef: row.evidenceRef } : {}),
  };
}

export function toVerificationOverrideDto(row: OverrideRow): VerificationOverride {
  return {
    id: row.id,
    findingId: row.findingId,
    architectureId: row.architectureId,
    userId: row.userId,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}
