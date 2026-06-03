import type { DriftEvent } from "@architectai/shared";
import type { InMemoryDriftHub } from "@/drift/drift-hub";

/**
 * Async enrichment after hot-path detection (P5-IT-01). Deterministic at MVP;
 * production swaps in Sonnet workload. Never blocks the hot path (P5-EC-09).
 */
export function scheduleDriftEnrichment(
  hub: InMemoryDriftHub,
  workspaceId: string,
  event: DriftEvent,
): void {
  setImmediate(() => {
    const enriched: DriftEvent = {
      ...event,
      whatHappened: `${event.whatHappened} Enriched: cross-service contract drift detected with measurable blast radius.`,
      impact: [
        {
          type: "security",
          description: "Trust boundary weakened until remediated.",
          iconType: "lock",
        },
      ],
      autoFix: event.autoFix,
    };
    hub.publish(workspaceId, { type: "drift.detected", payload: enriched });
  });
}
