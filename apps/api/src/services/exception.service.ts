import { eq } from "drizzle-orm";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/middleware/auth";
import { recordAudit } from "@/services/audit.service";
import { logger } from "@/lib/logger";

export interface RequestExceptionInput {
  driftEventId: string;
  reason: string;
  businessJustification: string;
  targetResolutionDate: string;
}

export async function requestException(
  tx: AppTx,
  auth: AuthContext,
  input: RequestExceptionInput,
): Promise<{ id: string; status: string }> {
  const [drift] = await tx
    .select()
    .from(schema.driftEvents)
    .where(eq(schema.driftEvents.id, input.driftEventId))
    .limit(1);
  if (!drift) throw ApiError.notFound("Drift event not found");
  if (!drift.ruleId) throw ApiError.badRequest("Drift has no linked rule");

  const [row] = await tx
    .insert(schema.exceptionRequests)
    .values({
      organizationId: auth.organizationId,
      requestedById: auth.userId,
      driftEventId: input.driftEventId,
      ruleId: drift.ruleId,
      reason: input.reason,
      businessJustification: input.businessJustification,
      targetResolutionDate: new Date(`${input.targetResolutionDate}T00:00:00.000Z`),
      status: "pending",
    })
    .returning();

  await tx
    .update(schema.driftEvents)
    .set({ status: "exception-pending" })
    .where(eq(schema.driftEvents.id, input.driftEventId));

  await recordAudit(tx, {
    organizationId: auth.organizationId,
    userId: auth.userId,
    eventType: "exception.requested",
    resourceType: "exception_request",
    resourceId: row!.id,
    payload: { driftEventId: input.driftEventId },
  });

  logger.info({ exceptionId: row!.id }, "Exception requested (notification stub)");

  return { id: row!.id, status: "pending" };
}

export async function reviewException(
  tx: AppTx,
  auth: AuthContext,
  exceptionId: string,
  input: { approved: boolean; reviewNotes?: string },
): Promise<{ id: string; status: string }> {
  const [ex] = await tx
    .select()
    .from(schema.exceptionRequests)
    .where(eq(schema.exceptionRequests.id, exceptionId))
    .limit(1);
  if (!ex) throw ApiError.notFound("Exception not found");

  const status = input.approved ? "approved" : "denied";
  await tx
    .update(schema.exceptionRequests)
    .set({
      status,
      reviewedById: auth.userId,
      reviewNotes: input.reviewNotes ?? null,
      reviewedAt: new Date(),
    })
    .where(eq(schema.exceptionRequests.id, exceptionId));

  if (input.approved) {
    await tx
      .update(schema.driftEvents)
      .set({ status: "exception-approved", resolvedAt: new Date() })
      .where(eq(schema.driftEvents.id, ex.driftEventId));
  }

  await recordAudit(tx, {
    organizationId: auth.organizationId,
    userId: auth.userId,
    eventType: input.approved ? "exception.approved" : "exception.denied",
    resourceType: "exception_request",
    resourceId: exceptionId,
  });

  return { id: exceptionId, status };
}
