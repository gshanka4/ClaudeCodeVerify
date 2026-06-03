import type { ResolvedDecisionTrace } from "@architectai/shared";

/** Human-readable AI reasoning prose for a component decision trace. */
export function buildDecisionNarrative(
  serviceDisplayName: string,
  trace: ResolvedDecisionTrace,
): string {
  const paragraphs: string[] = [];

  paragraphs.push(`**${serviceDisplayName}** — ${trace.summary}`);

  if (trace.userDecisionNote?.trim()) {
    paragraphs.push(
      `You refined this decision: ${trace.userDecisionNote.trim()} This note is stored with the lineage for this component.`,
    );
  }

  const evidenceLines: string[] = [];
  for (const step of trace.chain) {
    if (step.emptyMessage && step.nodes.length === 0) continue;
    for (const node of step.nodes) {
      let evidence = "";
      if (node.source) {
        evidence = node.sourceResolved
          ? ` Evidence: ${node.source.kind} (${node.source.confidence}% confidence).`
          : " Evidence is not yet verified — treat as provisional.";
      }
      evidenceLines.push(
        `${step.label} — ${node.label}: ${node.detail || "No additional detail."}${evidence}`,
      );
    }
  }

  if (evidenceLines.length > 0) {
    paragraphs.push(
      "The causal chain below is what the model used when placing this component on the canvas:",
    );
    paragraphs.push(evidenceLines.join("\n\n"));
  }

  if (trace.unresolvedNodeIds.length > 0) {
    paragraphs.push(
      `${trace.unresolvedNodeIds.length} lineage reference(s) could not be verified against interrogation or rule catalogs. Those items are flagged in the chain — they are not shown as established facts.`,
    );
  }

  paragraphs.push(
    `Recorded confidence for this component: ${trace.confidence}%. Use the chat below to challenge or refine the architectural decision; changes are saved to this component's trace.`,
  );

  return paragraphs.join("\n\n");
}
