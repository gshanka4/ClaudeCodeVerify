import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import type { CriticalDecisionTopic, DecisionChainResponse } from "@architectai/shared";
import { getDecisionChain, getLineageTopics } from "@/lib/api";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface Props {
  architectureId: string;
  selectedServiceId: string | null;
}

const SEVERITY_CLASS: Record<string, string> = {
  critical: "text-status-red",
  high: "text-status-amber",
  medium: "text-text-muted",
};

export function CriticalDecisionsSection({
  architectureId,
  selectedServiceId,
}: Props): JSX.Element {
  const [topics, setTopics] = useState<CriticalDecisionTopic[]>([]);
  const [chains, setChains] = useState<Record<string, DecisionChainResponse>>({});
  const expandedId = useWorkspaceStore((s) => s.expandedCriticalDecisionId);
  const setExpandedId = useWorkspaceStore((s) => s.setExpandedCriticalDecisionId);
  const openLineageGraph = useWorkspaceStore((s) => s.openLineageGraph);
  const setSelectedServiceId = useWorkspaceStore((s) => s.setSelectedServiceId);

  useEffect(() => {
    getLineageTopics(architectureId, selectedServiceId)
      .then((r) => setTopics(r.topics))
      .catch(() => setTopics([]));
  }, [architectureId, selectedServiceId]);

  useEffect(() => {
    if (selectedServiceId && topics.length > 0) {
      const top = topics[0];
      if (top?.id) setExpandedId(top.id);
    }
  }, [selectedServiceId, topics, setExpandedId]);

  const loadChain = async (topicId: string) => {
    if (chains[topicId]) return;
    try {
      const chain = await getDecisionChain(architectureId, topicId);
      setChains((c) => ({ ...c, [topicId]: chain }));
    } catch {
      /* ignore */
    }
  };

  const toggleExpand = (topic: CriticalDecisionTopic) => {
    const next = expandedId === topic.id ? null : topic.id;
    setExpandedId(next);
    if (next) void loadChain(next);
  };

  useEffect(() => {
    if (expandedId) void loadChain(expandedId);
  }, [expandedId]);

  if (topics.length === 0) {
    return (
      <p className="text-xs text-text-muted" data-testid="critical-decisions-empty">
        No critical decisions ranked yet. Complete generation to populate lineage.
      </p>
    );
  }

  return (
    <section className="mb-4" data-testid="critical-decisions-section">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-dim">
        Critical decisions
      </h3>
      <ul className="space-y-2">
        {topics.map((topic, index) => {
          const expanded = expandedId === topic.id;
          const chain = chains[topic.id];
          return (
            <li
              key={topic.id}
              className="rounded-md border border-border-subtle"
              data-testid={`critical-decision-card-${topic.id}`}
            >
              <button
                type="button"
                className="flex w-full flex-col gap-1 px-3 py-2 text-left text-sm"
                data-testid={`critical-decision-expand-${topic.id}`}
                onClick={() => toggleExpand(topic)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {index === 0 && selectedServiceId ? "★ " : ""}
                    {topic.title}
                  </span>
                  <span className={`text-xs ${SEVERITY_CLASS[topic.severity] ?? ""}`}>
                    {topic.severity}
                  </span>
                </div>
                <ul className="list-inside list-disc text-xs text-text-secondary">
                  {topic.chosenBecause.slice(0, 3).map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                {topic.hasUnresolvedProvenance ? (
                  <p
                    className="flex items-center gap-1 text-xs text-status-amber"
                    data-testid="critical-decision-unresolved"
                  >
                    <AlertTriangle size={12} />
                    Unresolved evidence — not shown as verified fact
                  </p>
                ) : null}
                <ChevronDown
                  size={14}
                  className={`self-end transition ${expanded ? "rotate-180" : ""}`}
                />
              </button>
              {expanded && chain ? (
                <ol
                  className="border-t border-border-subtle px-3 py-2 text-xs"
                  data-testid={`critical-decision-chain-${topic.id}`}
                >
                  {chain.steps.map((step, i) => (
                    <li key={`${step.kind}-${i}`} className="mb-2 last:mb-0">
                      <span className="text-text-ghost">{step.kind}</span>
                      <p className="font-medium">{step.label}</p>
                      <p className="text-text-dim">{step.detail}</p>
                      {step.source && !step.source.resolved ? (
                        <p className="text-status-amber">Unresolved provenance</p>
                      ) : null}
                    </li>
                  ))}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-brand-violet hover:underline"
                      onClick={() => openLineageGraph("critical-decisions")}
                    >
                      View in lineage graph
                    </button>
                    {topic.serviceId ? (
                      <button
                        type="button"
                        className="text-brand-violet hover:underline"
                        data-testid={`critical-decision-open-${topic.id}`}
                        onClick={() => setSelectedServiceId(topic.serviceId)}
                      >
                        Open decision lineage
                      </button>
                    ) : null}
                  </div>
                </ol>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
