import { useEffect, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { GenerationOverlay } from "@/components/generation/GenerationOverlay";
import { getArchitectureDetail } from "@/lib/api";
import { useSessionStore } from "@/stores/useSessionStore";

/** Phase H: `/generate/:id` recovery — redirect ready archs or show overlay. */
export default function GenerationRedirectPage(): JSX.Element {
  const { architectureId } = useParams<{ architectureId: string }>();
  const [searchParams] = useSearchParams();
  const sessionId = useSessionStore((s) => s.sessionId);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!architectureId) return;
    getArchitectureDetail(architectureId)
      .then((d) => setStatus(d.status))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, [architectureId]);

  if (!architectureId) {
    return <p className="p-8 text-text-muted">Missing architecture id</p>;
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" data-testid="generation-redirect-loading">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-violet border-t-transparent" />
      </div>
    );
  }

  if (status === "ready") {
    return <Navigate to={`/workspace/${architectureId}`} replace />;
  }

  const returnSession = searchParams.get("session") ?? sessionId;
  if (returnSession && status === "generating") {
    return (
      <Navigate
        to={`/interrogate/${returnSession}?generating=${architectureId}`}
        replace
      />
    );
  }

  const sid = returnSession ?? "";
  return (
    <GenerationOverlay
      architectureId={architectureId}
      onDismiss={() => {
        if (sid) window.location.assign(`/interrogate/${sid}`);
        else window.location.assign("/");
      }}
      onRetry={() => window.location.reload()}
    />
  );
}
