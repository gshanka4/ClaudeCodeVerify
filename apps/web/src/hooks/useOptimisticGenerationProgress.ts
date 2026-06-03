import type { GenerationProgressEvent } from "@architectai/shared";
import { useEffect, useState } from "react";

const TICK_MS = 400;
const CAP_BEFORE_SSE = 18;

/** Client-side progress floor until the first SSE progress event arrives. */
export function useOptimisticGenerationProgress(
  serverProgress: GenerationProgressEvent | null | undefined,
  streamComplete: boolean,
): { displayProgress: number; phaseLabel: string; isOptimistic: boolean } {
  const [optimistic, setOptimistic] = useState(4);

  useEffect(() => {
    if (serverProgress || streamComplete) return;
    const t = setInterval(() => {
      setOptimistic((p) => Math.min(CAP_BEFORE_SSE, p + 2));
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
    phaseLabel: "Planning blueprint with your LLM…",
    isOptimistic: true,
  };
}
