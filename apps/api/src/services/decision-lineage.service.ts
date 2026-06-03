import type { DecisionTrace, ResolvedDecisionTrace } from "@architectai/shared";
import { and, eq } from "drizzle-orm";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import { buildDecisionNarrative } from "@/lib/decision-narrative";
import { resolveDecisionTrace } from "@/services/lineage-read.service";

export async function chatDecisionLineage(
  tx: AppTx,
  architectureId: string,
  serviceId: string,
  serviceDisplayName: string,
  message: string,
): Promise<{ reply: string; trace: ResolvedDecisionTrace }> {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error("Message is required");
  }

  const [traceRow] = await tx
    .select()
    .from(schema.decisionTraces)
    .where(
      and(
        eq(schema.decisionTraces.architectureId, architectureId),
        eq(schema.decisionTraces.serviceId, serviceId),
      ),
    )
    .limit(1);

  if (!traceRow) {
    return {
      reply:
        "No decision trace exists for this component yet. Complete architecture generation first.",
      trace: {
        serviceId,
        summary: "",
        confidence: 0,
        chain: [],
        unresolvedNodeIds: [],
        narrative:
          "Decision lineage is not available until generation completes for this architecture.",
      },
    };
  }

  const prior = traceRow.traceJson as DecisionTrace & { userDecisionNote?: string };
  const priorNotes = prior.userDecisionNote?.trim() ?? "";
  const mergedNote = priorNotes ? `${priorNotes}\n${trimmed}` : trimmed;

  const updatedTrace: DecisionTrace & { userDecisionNote?: string } = {
    ...prior,
    userDecisionNote: mergedNote,
    summary: `${prior.summary} (Refined: ${trimmed.slice(0, 120)}${trimmed.length > 120 ? "…" : ""})`,
  };

  await tx
    .update(schema.decisionTraces)
    .set({ traceJson: updatedTrace })
    .where(
      and(
        eq(schema.decisionTraces.architectureId, architectureId),
        eq(schema.decisionTraces.serviceId, serviceId),
      ),
    );

  const resolved = await resolveDecisionTrace(tx, architectureId, serviceId);
  const trace: ResolvedDecisionTrace = {
    ...(resolved ?? {
      serviceId,
      summary: updatedTrace.summary,
      confidence: updatedTrace.confidence,
      chain: [],
      unresolvedNodeIds: [],
    }),
    userDecisionNote: mergedNote,
    narrative: buildDecisionNarrative(
      serviceDisplayName,
      {
        ...(resolved ?? {
          serviceId,
          summary: updatedTrace.summary,
          confidence: updatedTrace.confidence,
          chain: [],
          unresolvedNodeIds: [],
        }),
        userDecisionNote: mergedNote,
      },
    ),
  };

  const reply = [
    `Understood — your input on **${serviceDisplayName}** has been recorded in the decision lineage.`,
    `You wrote: "${trimmed}"`,
    "The narrative and summary above reflect this refinement. Export or regenerate will use the updated trace when a new lock baseline is taken.",
    trace.unresolvedNodeIds.length > 0
      ? "Note: some lineage references remain unverified; resolve those before treating the chain as audit-grade."
      : "The causal chain remains grounded in interrogation and governance evidence from generation.",
  ].join("\n\n");

  return { reply, trace };
}
