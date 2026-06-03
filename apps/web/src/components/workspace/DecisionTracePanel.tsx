import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft } from "lucide-react";
import type { ResolvedDecisionTrace } from "@architectai/shared";
import { decisionLineageChat, getServiceTrace } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { VerificationFindingsSection } from "@/components/workspace/VerificationFindingsSection";

interface Props {
  architectureId: string;
  serviceId: string;
  serviceDisplayName: string;
  onOpenLineageGraph: () => void;
}

function TraceSkeleton(): JSX.Element {
  return (
    <div className="space-y-3 animate-pulse" data-testid="decision-trace-skeleton">
      <div className="h-3 w-3/4 rounded bg-bg-elevated" />
      <div className="h-16 rounded-md bg-bg-elevated" />
      <div className="h-16 rounded-md bg-bg-elevated" />
      <div className="h-16 rounded-md bg-bg-elevated" />
    </div>
  );
}

export function DecisionTracePanel({
  architectureId,
  serviceId,
  serviceDisplayName,
  onOpenLineageGraph,
}: Props): JSX.Element {
  const setSelectedServiceId = useWorkspaceStore((s) => s.setSelectedServiceId);
  const expandedTraceSteps = useWorkspaceStore((s) => s.expandedTraceSteps);
  const toggleTraceStep = useWorkspaceStore((s) => s.toggleTraceStep);
  const verificationFindings = useWorkspaceStore((s) => s.verificationFindings);
  const verificationLoading = useWorkspaceStore((s) => s.verificationLoading);
  const showAdvisorySignals = useWorkspaceStore((s) => s.showAdvisorySignals);
  const setShowAdvisorySignals = useWorkspaceStore((s) => s.setShowAdvisorySignals);

  const [trace, setTrace] = useState<ResolvedDecisionTrace | null>(null);
  const [loadedForServiceId, setLoadedForServiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [chatting, setChatting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setTrace(null);
    setLoadedForServiceId(null);
    setChatReply(null);

    getServiceTrace(architectureId, serviceId)
      .then((data) => {
        if (cancelled) return;
        setTrace(data);
        setLoadedForServiceId(serviceId);
      })
      .catch(() => {
        if (cancelled) return;
        setTrace(null);
        setLoadedForServiceId(serviceId);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [architectureId, serviceId]);

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    setChatting(true);
    try {
      const res = await decisionLineageChat(architectureId, serviceId, chatInput.trim());
      setTrace(res.trace);
      setLoadedForServiceId(serviceId);
      setChatReply(res.reply);
      setChatInput("");
    } catch {
      setChatReply("Unable to apply your refinement right now. Try again.");
    } finally {
      setChatting(false);
    }
  };

  const showTrace = !loading && loadedForServiceId === serviceId && trace;

  return (
    <div className="flex h-full flex-col" data-testid="decision-trace-panel">
      <header className="flex shrink-0 items-center gap-2 border-b border-border-muted px-4 py-3">
        <button
          type="button"
          className="text-text-muted hover:text-text-primary"
          aria-label="Back to architecture overview"
          onClick={() => setSelectedServiceId(null)}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">Decision trace</h2>
          <p className="truncate text-xs text-text-dim">{serviceDisplayName}</p>
        </div>
        {showTrace ? <span className="text-xs text-text-dim">{trace.confidence}%</span> : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <TraceSkeleton />
        ) : showTrace ? (
          <section className="mb-4" data-testid="decision-lineage-chain">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-dim">
              Causal chain
            </h3>
            <p className="mb-3 text-xs text-text-secondary">{trace.summary}</p>
            <ol className="space-y-2">
              {trace.chain
                .filter((step) => step.nodes.length > 0)
                .map((step) => {
                const key = `${serviceId}-${step.stepType}`;
                const expanded = expandedTraceSteps.has(key);
                return (
                  <li
                    key={key}
                    className="rounded-md border border-border-subtle"
                    data-testid={`trace-step-${step.stepType}`}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                      data-testid="trace-step-expand"
                      onClick={() => toggleTraceStep(key)}
                    >
                      <span>{step.label}</span>
                      <ChevronDown
                        size={14}
                        className={`transition ${expanded ? "rotate-180" : ""}`}
                      />
                    </button>
                    {expanded ? (
                      <div className="border-t border-border-subtle px-3 py-2 text-xs">
                        {step.emptyMessage ? (
                          <p className="italic text-text-muted">{step.emptyMessage}</p>
                        ) : (
                          step.nodes.map((node) => (
                            <div key={node.id} className="mb-2 last:mb-0">
                              <p className="font-medium text-text-primary">{node.label}</p>
                              <p className="text-text-dim">{node.detail}</p>
                              {node.source ? (
                                node.sourceResolved ? (
                                  <p className="mt-1 text-text-muted" data-testid="trace-evidence">
                                    Source: {node.source.kind} · {node.source.confidence}%
                                    confidence
                                  </p>
                                ) : (
                                  <p
                                    className="mt-1 text-status-amber"
                                    data-testid="trace-unresolved"
                                  >
                                    Unverified provenance — not shown as fact
                                  </p>
                                )
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <button
              type="button"
              className="mt-3 text-xs text-brand-violet hover:underline"
              data-testid="lineage-graph-open-from-panel"
              onClick={onOpenLineageGraph}
            >
              View provenance graph
            </button>
          </section>
        ) : (
          <p className="text-sm text-text-muted" data-testid="decision-trace-empty">
            Trace not available for this component.
          </p>
        )}

        <VerificationFindingsSection
          findings={verificationFindings}
          loading={verificationLoading}
          serviceId={serviceId}
          showAdvisorySignals={showAdvisorySignals}
          onToggleAdvisorySignals={setShowAdvisorySignals}
        />

        {chatReply ? (
          <p
            className="mb-3 rounded border border-border-subtle bg-bg-elevated px-3 py-2 text-xs text-text-secondary"
            data-testid="decision-lineage-chat-reply"
          >
            {chatReply}
          </p>
        ) : null}
      </div>

      <footer
        className="shrink-0 border-t border-border-muted bg-bg-panel px-4 py-3"
        data-testid="decision-lineage-chat"
      >
        <label className="mb-1 block text-xs font-medium text-text-dim">
          Refine this architectural decision
        </label>
        <textarea
          className="mb-2 w-full rounded border border-border-subtle bg-bg-elevated px-2 py-2 text-sm"
          rows={3}
          placeholder="e.g. Prefer gRPC over REST for this service because of internal latency targets…"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          data-testid="decision-lineage-chat-input"
        />
        <Button
          disabled={chatting || !chatInput.trim()}
          data-testid="decision-lineage-chat-send"
          onClick={() => void handleChat()}
        >
          Apply refinement
        </Button>
      </footer>
    </div>
  );
}
