import type { AppTx } from "@/db/client";
import { getArchitectureLineage } from "@/services/lineage-read.service";

export async function askArchitecture(
  tx: AppTx,
  architectureId: string,
  question: string,
): Promise<{ answer: string; groundedInLineage: boolean }> {
  const lineage = await getArchitectureLineage(tx, architectureId);
  const trimmed = question.trim();
  if (!trimmed) {
    return { answer: "Please enter a question about this architecture.", groundedInLineage: false };
  }

  if (!lineage || lineage.traces.length === 0) {
    return {
      answer:
        "This architecture has no decision lineage yet. Complete generation first, then ask about provenance and governance.",
      groundedInLineage: false,
    };
  }

  const serviceSummaries = lineage.traces
    .map((t) => t.summary)
    .slice(0, 5)
    .join("; ");

  const answer = [
    `Based on the decision lineage for this architecture (${lineage.traces.length} components):`,
    serviceSummaries,
    `Regarding your question "${trimmed}":`,
    "the recorded traces cite interrogation answers and governance rules captured at generation time.",
    "Review the Decision Trace panel on each node for the full causal chain and evidence.",
  ].join(" ");

  return { answer, groundedInLineage: true };
}
