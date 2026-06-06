import type { GenerationProgressEvent } from "@architectai/shared";
import { useEffect, useState } from "react";

const TICK_MS = 350;
const CAP_BEFORE_SSE = 28;

const OPTIMISTIC_PHASES: { max: number; label: string }[] = [
  { max: 10, label: "Planning blueprint with your LLM…" },
  { max: 18, label: "Mapping services and boundaries…" },
  { max: 24, label: "Applying governance rules…" },
  { max: CAP_BEFORE_SSE, label: "Streaming architecture nodes…" },
];

function labelForOptimistic(progress: number): string {
  return (
    OPTIMISTIC_PHASES.find((p) => progress <= p.max)?.label ??
    OPTIMISTIC_PHASES[OPTIMISTIC_PHASES.length - 1]!.label
  );
}

/** Client-side progress floor until the first SSE progress event arrives. */
export function useOptimisticGenerationProgress(
  serverProgress: GenerationProgressEvent | null | undefined,
  streamComplete: boolean,
): { displayProgress: number; phaseLabel: string; isOptimistic: boolean } {
  const [optimistic, setOptimistic] = useState(6);

  useEffect(() => {
    if (serverProgress || streamComplete) return;
    const t = setInterval(() => {
      setOptimistic((p) => Math.min(CAP_BEFORE_SSE, p + 1));
    }, TICK_MS);
    return () => clearInterval(t);
  }, [serverProgress, streamComplete]);

  if (serverProgress) {
    return {
      displayProgress: serverProgress.progress,
      phaseLabel: serverProgress.phaseLabel ?? "Generating…",
      isOptimistic: false,
    };
  }

  return {
    displayProgress: optimistic,
    phaseLabel: labelForOptimistic(optimistic),
    isOptimistic: true,
  };
}
