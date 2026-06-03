import type { AuditEventType } from "@architectai/shared";
import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";

export interface RecordAuditInput {
  organizationId: string;
  userId: string | null;
  eventType: AuditEventType | string;
  resourceType: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Append an immutable audit record. Call inside the same tenant transaction as the
 * action so it shares the RLS context (and rolls back if the action fails).
 */
export async function recordAudit(tx: AppTx, input: RecordAuditInput): Promise<void> {
  await tx.insert(schema.auditEvents).values({
    organizationId: input.organizationId,
    userId: input.userId,
    eventType: input.eventType,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    payloadJson: input.payload ?? {},
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export interface AuditEventDto {
  id: string;
  eventType: string;
  resourceType: string;
  resourceId: string | null;
  userId: string | null;
  payload: unknown;
  occurredAt: string;
}

export interface ListAuditParams {
  resourceType?: string;
  resourceId?: string;
  from?: Date;
  to?: Date;
  page: number;
  perPage: number;
}

export async function listAudit(
  tx: AppTx,
  params: ListAuditParams,
): Promise<{ rows: AuditEventDto[]; total: number }> {
  const conds: SQL[] = [];
  if (params.resourceType) conds.push(eq(schema.auditEvents.resourceType, params.resourceType));
  if (params.resourceId) conds.push(eq(schema.auditEvents.resourceId, params.resourceId));
  if (params.from) conds.push(gte(schema.auditEvents.occurredAt, params.from));
  if (params.to) conds.push(lte(schema.auditEvents.occurredAt, params.to));
  const where = conds.length ? and(...conds) : undefined;

  const rows = await tx
    .select()
    .from(schema.auditEvents)
    .where(where)
    .orderBy(desc(schema.auditEvents.occurredAt))
    .limit(params.perPage)
    .offset((params.page - 1) * params.perPage);

  const [totals] = await tx.select({ value: count() }).from(schema.auditEvents).where(where);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      userId: r.userId,
      payload: r.payloadJson,
      occurredAt: r.occurredAt.toISOString(),
    })),
    total: totals?.value ?? 0,
  };
}
