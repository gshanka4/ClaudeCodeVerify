import { and, desc, eq } from "drizzle-orm";
import type {
  VerificationFinding,
  VerificationOverride,
  VerificationRun,
} from "@architectai/shared";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import {
  toVerificationFindingDto,
  toVerificationOverrideDto,
  toVerificationRunDto,
} from "@/services/verification.mapper";
import {
  recordOverrideInputSchema,
  verificationFindingInputSchema,
  type VerificationFindingInput,
} from "@/services/verification.schemas";

export interface CreateVerificationRunInput {
  architectureId: string;
  organizationId: string;
  version: number;
  engineVersions?: Record<string, string>;
}

export interface CompleteVerificationRunInput {
  trustGrade: number;
}

export interface VerificationRunWithFindings {
  run: VerificationRun;
  findings: VerificationFinding[];
  overrides: VerificationOverride[];
}

export async function createVerificationRun(
  tx: AppTx,
  input: CreateVerificationRunInput,
): Promise<VerificationRun> {
  const [row] = await tx
    .insert(schema.verificationRuns)
    .values({
      architectureId: input.architectureId,
      organizationId: input.organizationId,
      version: input.version,
      status: "running",
      trustGrade: 0,
      engineVersions: input.engineVersions ?? {},
    })
    .returning();
  return toVerificationRunDto(row!);
}

export async function completeVerificationRun(
  tx: AppTx,
  runId: string,
  input: CompleteVerificationRunInput,
): Promise<VerificationRun | null> {
  const [row] = await tx
    .update(schema.verificationRuns)
    .set({
      status: "complete",
      trustGrade: input.trustGrade,
      finishedAt: new Date(),
    })
    .where(eq(schema.verificationRuns.id, runId))
    .returning();
  return row ? toVerificationRunDto(row) : null;
}

export async function updateVerificationRunTrustGrade(
  tx: AppTx,
  runId: string,
  input: { trustGrade: number; engineVersions?: Record<string, string> },
): Promise<void> {
  const [existing] = await tx
    .select({ engineVersions: schema.verificationRuns.engineVersions })
    .from(schema.verificationRuns)
    .where(eq(schema.verificationRuns.id, runId))
    .limit(1);

  const mergedVersions = {
    ...(existing?.engineVersions ?? {}),
    ...(input.engineVersions ?? {}),
  };

  await tx
    .update(schema.verificationRuns)
    .set({
      trustGrade: input.trustGrade,
      engineVersions: mergedVersions,
    })
    .where(eq(schema.verificationRuns.id, runId));
}

export async function getFindingsForRun(tx: AppTx, runId: string): Promise<VerificationFinding[]> {
  const rows = await tx
    .select()
    .from(schema.verificationFindings)
    .where(eq(schema.verificationFindings.runId, runId));
  return rows.map(toVerificationFindingDto);
}

export async function insertVerificationFindings(
  tx: AppTx,
  runId: string,
  architectureId: string,
  findings: VerificationFindingInput[],
): Promise<VerificationFinding[]> {
  if (findings.length === 0) return [];

  const [runRow] = await tx
    .select({ architectureId: schema.verificationRuns.architectureId })
    .from(schema.verificationRuns)
    .where(eq(schema.verificationRuns.id, runId))
    .limit(1);

  if (!runRow) {
    throw ApiError.notFound("Verification run not found");
  }
  if (runRow.architectureId !== architectureId) {
    throw ApiError.validation("Finding architecture_id must match verification run");
  }

  const parsed = findings.map((f, i) => {
    const result = verificationFindingInputSchema.safeParse(f);
    if (!result.success) {
      throw ApiError.validation(`Invalid finding at index ${i}`, {
        groundTruthSource: result.error.issues.map((iss) => iss.message),
      });
    }
    return result.data;
  });

  const rows = await tx
    .insert(schema.verificationFindings)
    .values(
      parsed.map((f) => ({
        runId,
        architectureId,
        serviceId: f.serviceId ?? null,
        lineageNodeId: f.lineageNodeId ?? null,
        check: f.check,
        tier: f.tier,
        verdict: f.verdict,
        confidence: f.confidence,
        groundTruthSource: f.groundTruthSource,
        detail: f.detail,
        evidenceRef: f.evidenceRef ?? null,
      })),
    )
    .returning();

  return rows.map(toVerificationFindingDto);
}

export async function getLatestVerificationRun(
  tx: AppTx,
  architectureId: string,
): Promise<VerificationRunWithFindings | null> {
  const [runRow] = await tx
    .select()
    .from(schema.verificationRuns)
    .where(eq(schema.verificationRuns.architectureId, architectureId))
    .orderBy(desc(schema.verificationRuns.startedAt))
    .limit(1);

  if (!runRow) return null;

  const findingRows = await tx
    .select()
    .from(schema.verificationFindings)
    .where(eq(schema.verificationFindings.runId, runRow.id));

  const overrideRows = await tx
    .select()
    .from(schema.verificationOverrides)
    .where(eq(schema.verificationOverrides.architectureId, architectureId));

  return {
    run: toVerificationRunDto(runRow),
    findings: findingRows.map(toVerificationFindingDto),
    overrides: overrideRows.map(toVerificationOverrideDto),
  };
}

export async function getVerificationRunById(
  tx: AppTx,
  runId: string,
): Promise<VerificationRun | null> {
  const [row] = await tx
    .select()
    .from(schema.verificationRuns)
    .where(eq(schema.verificationRuns.id, runId))
    .limit(1);
  return row ? toVerificationRunDto(row) : null;
}

export async function listOverridesForArchitecture(
  tx: AppTx,
  architectureId: string,
): Promise<VerificationOverride[]> {
  const rows = await tx
    .select()
    .from(schema.verificationOverrides)
    .where(eq(schema.verificationOverrides.architectureId, architectureId));
  return rows.map(toVerificationOverrideDto);
}

export async function recordVerificationOverride(
  tx: AppTx,
  input: { findingId: string; architectureId: string; userId: string; reason: string },
): Promise<VerificationOverride> {
  const parsed = recordOverrideInputSchema.safeParse({ reason: input.reason });
  if (!parsed.success) {
    throw ApiError.validation("Override reason must be at least 10 characters");
  }

  const [finding] = await tx
    .select()
    .from(schema.verificationFindings)
    .where(
      and(
        eq(schema.verificationFindings.id, input.findingId),
        eq(schema.verificationFindings.architectureId, input.architectureId),
      ),
    )
    .limit(1);

  if (!finding) {
    throw ApiError.notFound("Verification finding not found");
  }

  const [existing] = await tx
    .select({ id: schema.verificationOverrides.id })
    .from(schema.verificationOverrides)
    .where(eq(schema.verificationOverrides.findingId, input.findingId))
    .limit(1);

  if (existing) {
    throw ApiError.conflict("Finding already has an override");
  }

  const [row] = await tx
    .insert(schema.verificationOverrides)
    .values({
      findingId: input.findingId,
      architectureId: input.architectureId,
      userId: input.userId,
      reason: parsed.data.reason,
    })
    .returning();

  return toVerificationOverrideDto(row!);
}

export async function failVerificationRun(tx: AppTx, runId: string): Promise<void> {
  await tx
    .update(schema.verificationRuns)
    .set({ status: "failed", finishedAt: new Date() })
    .where(eq(schema.verificationRuns.id, runId));
}

export async function getCompleteRunForVersion(
  tx: AppTx,
  architectureId: string,
  version: number,
): Promise<VerificationRun | null> {
  const [row] = await tx
    .select()
    .from(schema.verificationRuns)
    .where(
      and(
        eq(schema.verificationRuns.architectureId, architectureId),
        eq(schema.verificationRuns.version, version),
        eq(schema.verificationRuns.status, "complete"),
      ),
    )
    .orderBy(desc(schema.verificationRuns.startedAt))
    .limit(1);
  return row ? toVerificationRunDto(row) : null;
}

export async function getRunningRunForVersion(
  tx: AppTx,
  architectureId: string,
  version: number,
): Promise<VerificationRun | null> {
  const [row] = await tx
    .select()
    .from(schema.verificationRuns)
    .where(
      and(
        eq(schema.verificationRuns.architectureId, architectureId),
        eq(schema.verificationRuns.version, version),
        eq(schema.verificationRuns.status, "running"),
      ),
    )
    .limit(1);
  return row ? toVerificationRunDto(row) : null;
}

export async function getVerificationFindingById(
  tx: AppTx,
  findingId: string,
): Promise<VerificationFinding | null> {
  const [row] = await tx
    .select()
    .from(schema.verificationFindings)
    .where(eq(schema.verificationFindings.id, findingId))
    .limit(1);
  return row ? toVerificationFindingDto(row) : null;
}

export async function getCompleteRunWithFindingsForVersion(
  tx: AppTx,
  architectureId: string,
  version: number,
): Promise<VerificationRunWithFindings | null> {
  const run = await getCompleteRunForVersion(tx, architectureId, version);
  if (!run) return null;

  const findingRows = await tx
    .select()
    .from(schema.verificationFindings)
    .where(eq(schema.verificationFindings.runId, run.id));

  const overrideRows = await tx
    .select()
    .from(schema.verificationOverrides)
    .where(eq(schema.verificationOverrides.architectureId, architectureId));

  return {
    run,
    findings: findingRows.map(toVerificationFindingDto),
    overrides: overrideRows.map(toVerificationOverrideDto),
  };
}
