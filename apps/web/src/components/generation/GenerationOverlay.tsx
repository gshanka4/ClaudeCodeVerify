import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { VerificationSummary } from "@architectai/shared";
import { GenerationExperience } from "@/components/generation/GenerationExperience";
import { useGenerationStream } from "@/hooks/useGenerationStream";
import { useVerificationStream } from "@/hooks/useVerificationStream";
import { cancelGeneration, getVerificationSummary, triggerVerification } from "@/lib/api";

const MIN_VERIFY_VIEW_MS = 2500;
const MIN_GENERATION_COMPLETE_MS = 1800;

interface Props {
  architectureId: string;
  onError?: (message: string) => void;
  onDismiss: (streamError?: string | null) => void;
  onRetry: () => void;
}

export function GenerationOverlay({
  architectureId,
  onError,
  onDismiss,
  onRetry,
}: Props): JSX.Element {
  const navigate = useNavigate();
  const stream = useGenerationStream(architectureId);
  const [verifyRunId, setVerifyRunId] = useState<string | undefined>();
  const [verifyComplete, setVerifyComplete] = useState(false);
  const [readyToNavigate, setReadyToNavigate] = useState(false);
  const [completedSummary, setCompletedSummary] = useState<VerificationSummary | null>(null);
  const verifyStream = useVerificationStream(architectureId, verifyRunId);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelledRef = useRef(false);
  const generationCompleteAt = useRef<number | null>(null);

  useEffect(() => {
    if (stream.complete && generationCompleteAt.current === null) {
      generationCompleteAt.current = Date.now();
    }
  }, [stream.complete]);

  useEffect(() => {
    if (!stream.complete || verifyRunId) return;
    void (async () => {
      try {
        const summary = await getVerificationSummary(architectureId);
        setCompletedSummary(summary);
        setVerifyRunId(summary.run.id);
        if (summary.run.status === "complete") {
          setVerifyComplete(true);
        }
        return;
      } catch {
        /* trigger below */
      }
      try {
        const started = await triggerVerification(architectureId);
        setVerifyRunId(started.runId);
      } catch {
        onError?.("Failed to start verification");
      }
    })();
  }, [stream.complete, verifyRunId, architectureId, onError]);

  useEffect(() => {
    if (verifyStream.complete) setVerifyComplete(true);
  }, [verifyStream.complete]);

  useEffect(() => {
    if (!verifyRunId || verifyComplete) return;
    const poll = setInterval(() => {
      void getVerificationSummary(architectureId)
        .then((summary) => {
          if (summary.run.status === "complete") {
            setCompletedSummary(summary);
            setVerifyComplete(true);
          }
        })
        .catch(() => undefined);
    }, 400);
    return () => clearInterval(poll);
  }, [verifyRunId, verifyComplete, architectureId]);

  useEffect(() => {
    if (!verifyComplete) return;
    const generationElapsed = generationCompleteAt.current
      ? Date.now() - generationCompleteAt.current
      : MIN_GENERATION_COMPLETE_MS;
    const waitMs = Math.max(MIN_VERIFY_VIEW_MS, MIN_GENERATION_COMPLETE_MS - generationElapsed, 0);
    const t = setTimeout(() => setReadyToNavigate(true), waitMs);
    return () => clearTimeout(t);
  }, [verifyComplete]);

  useEffect(() => {
    if (!readyToNavigate || cancelledRef.current) return;
    sessionStorage.removeItem(`gen:lastEventId:${architectureId}`);
    if (verifyRunId) {
      sessionStorage.removeItem(`verify:lastEventId:${architectureId}:${verifyRunId}`);
    }
    navigate(`/workspace/${architectureId}`, { replace: true });
  }, [readyToNavigate, architectureId, verifyRunId, navigate]);

  const handleCancel = async () => {
    if (!confirmCancel) {
      cancelledRef.current = true;
      setConfirmCancel(true);
      return;
    }
    setCancelling(true);
    cancelledRef.current = true;
    onDismiss(stream.error);
    try {
      await cancelGeneration(architectureId);
      sessionStorage.removeItem(`gen:lastEventId:${architectureId}`);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  };

  const handleEditAnswers = () => {
    sessionStorage.removeItem(`gen:lastEventId:${architectureId}`);
    onDismiss(stream.error);
  };

  const handleRetryVerify = () => {
    void (async () => {
      try {
        const started = await triggerVerification(architectureId, { force: true });
        setVerifyRunId(started.runId);
        setVerifyComplete(false);
        setCompletedSummary(null);
      } catch (e) {
        onError?.(e instanceof Error ? e.message : "Failed to retry verification");
      }
    })();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-bg-base/95 px-6 py-10 backdrop-blur-sm"
      data-testid="generation-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generation-overlay-title"
    >
      <div className="max-h-full w-full max-w-4xl overflow-y-auto">
        <GenerationExperience
          stream={stream}
          verifyStream={verifyStream}
          completedSummary={completedSummary}
          onCancel={() => void handleCancel()}
          cancelling={cancelling}
          confirmCancel={confirmCancel}
          onRetry={stream.error ? onRetry : undefined}
          onEditAnswers={stream.error ? handleEditAnswers : undefined}
          onRetryVerify={verifyStream.error ? handleRetryVerify : undefined}
        />
      </div>
    </div>
  );
}
