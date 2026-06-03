import type { VerificationFinding } from "@architectai/shared";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  findings: VerificationFinding[];
  loading?: boolean;
  serviceId?: string;
  showAdvisorySignals?: boolean;
  onToggleAdvisorySignals?: (show: boolean) => void;
}

function isUngrounded(finding: VerificationFinding): boolean {
  return (
    finding.verdict === "unverified" &&
    finding.tier === "deterministic" &&
    !finding.groundTruthSource?.ref
  );
}

function VerdictBadge({ finding }: { finding: VerificationFinding }): JSX.Element {
  if (finding.tier === "probabilistic") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded border border-brand-violet/40 bg-brand-violet/10 px-1.5 py-0.5 text-[10px] text-brand-violetLight"
        data-testid="finding-probabilistic-badge"
      >
        ~{Math.round(finding.confidence * 100)}%
        <span className="text-text-dim">signal, not proof</span>
      </span>
    );
  }

  if (finding.verdict === "verified") {
    return (
      <span
        className="inline-flex items-center gap-1 text-status-green"
        data-testid="finding-deterministic-verified"
      >
        ✅ proven
      </span>
    );
  }
  if (finding.verdict === "conflict") {
    return (
      <span
        className="inline-flex items-center gap-1 text-status-red"
        data-testid="finding-deterministic-conflict"
      >
        ❌ conflict
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-status-amber"
      data-testid="finding-deterministic-unverified"
    >
      ⚠ unverified
    </span>
  );
}

function FindingRow({ finding }: { finding: VerificationFinding }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const ungrounded = isUngrounded(finding);
  const blocksLock =
    finding.tier === "deterministic" &&
    finding.verdict === "conflict" &&
    Boolean(finding.serviceId);

  return (
    <li
      className={cn(
        "rounded-md border",
        finding.tier === "probabilistic"
          ? "border-brand-violet/30 bg-brand-violet/5"
          : finding.verdict === "conflict"
            ? "border-status-red/40 bg-status-red/5"
            : finding.verdict === "unverified"
              ? "border-status-amber/40 bg-status-amber/5"
              : "border-border-subtle bg-bg-elevated/50",
      )}
      data-testid="verification-finding-row"
      data-finding-tier={finding.tier}
      data-finding-verdict={finding.verdict}
      data-blocks-lock={blocksLock ? "true" : "false"}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm"
        data-testid="verification-finding-expand"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] text-text-dim">{finding.check}</p>
          <p className="mt-0.5 text-text-primary">{finding.detail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <VerdictBadge finding={finding} />
          <ChevronDown
            size={14}
            className={cn("text-text-muted transition", expanded && "rotate-180")}
          />
        </div>
      </button>
      {expanded ? (
        <div
          className="space-y-2 border-t border-border-subtle px-3 py-2 text-xs text-text-secondary"
          data-testid="verification-finding-detail"
        >
          <p>
            <span className="text-text-dim">Check:</span> {finding.check}
          </p>
          <p>
            <span className="text-text-dim">Verdict:</span> {finding.verdict}
          </p>
          <p>
            <span className="text-text-dim">Ground truth:</span>{" "}
            {finding.groundTruthSource.kind} · {finding.groundTruthSource.ref}
          </p>
          <p>
            <span className="text-text-dim">Confidence:</span>{" "}
            {finding.tier === "deterministic"
              ? "100% (deterministic)"
              : `${Math.round(finding.confidence * 100)}% (probabilistic)`}
          </p>
          {finding.evidenceRef ? (
            <p>
              <span className="text-text-dim">Evidence:</span> {finding.evidenceRef}
            </p>
          ) : null}
          {ungrounded ? (
            <p className="text-status-amber" data-testid="finding-ungrounded-flag">
              Ungrounded — flagged, not shown as proven fact
            </p>
          ) : null}
          {finding.tier === "probabilistic" ? (
            <p className="italic text-text-dim" data-testid="finding-advisory-label">
              Advisory signal — does not block Lock
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function VerificationFindingsSection({
  findings,
  loading,
  serviceId,
  showAdvisorySignals = true,
  onToggleAdvisorySignals,
}: Props): JSX.Element {
  const scoped = serviceId
    ? findings.filter((f) => !f.serviceId || f.serviceId === serviceId)
    : findings;

  const visible = showAdvisorySignals
    ? scoped
    : scoped.filter((f) => f.tier !== "probabilistic");

  return (
    <section className="mt-4 border-t border-border-muted pt-4" data-testid="verification-findings-section">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-text-dim">Verification</h3>
        {onToggleAdvisorySignals ? (
          <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-text-dim">
            <input
              type="checkbox"
              checked={showAdvisorySignals}
              onChange={(e) => onToggleAdvisorySignals(e.target.checked)}
              data-testid="show-advisory-signals-toggle"
            />
            Show advisory signals
          </label>
        ) : null}
      </div>
      {loading ? (
        <div className="space-y-2 animate-pulse" data-testid="verification-findings-skeleton">
          <div className="h-12 rounded-md bg-bg-elevated" />
          <div className="h-12 rounded-md bg-bg-elevated" />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-status-green" data-testid="verification-findings-empty">
          ✅ No open findings — component verified
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((f) => (
            <FindingRow key={f.id} finding={f} />
          ))}
        </ul>
      )}
    </section>
  );
}
