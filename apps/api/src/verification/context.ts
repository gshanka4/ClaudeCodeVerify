import { eq } from "drizzle-orm";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import { getArchitectureDetail } from "@/services/architectures.service";
import { loadActiveRulesForArchitecture } from "@/services/governance.service";
import {
  buildReferentialContext,
  getArchitectureLineage,
  loadRequirementGroundTruth,
} from "@/services/lineage-read.service";
import type { VerificationContext } from "@/verification/types";

/** Load a full in-memory snapshot for Tier-1 verification. */
export async function loadVerificationContext(
  tx: AppTx,
  architectureId: string,
): Promise<VerificationContext | null> {
  const detail = await getArchitectureDetail(tx, architectureId);
  if (!detail) return null;

  const lineage = await getArchitectureLineage(tx, architectureId);
  if (!lineage) return null;

  const [archRow] = await tx
    .select({ sessionId: schema.architectures.interrogationSessionId })
    .from(schema.architectures)
    .where(eq(schema.architectures.id, architectureId))
    .limit(1);

  const referentialContext = await buildReferentialContext(tx, architectureId);
  const requirements = await loadRequirementGroundTruth(tx, architectureId);
  const rules = await loadActiveRulesForArchitecture(tx, architectureId);

  return {
    architectureId,
    version: detail.version,
    services: detail.services,
    connections: detail.connections,
    lineage,
    requirements,
    rules,
    referentialContext,
    hasInterrogationSession: Boolean(archRow?.sessionId),
  };
}
