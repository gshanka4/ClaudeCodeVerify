interface Props {
  trustGrade?: number | null;
  verificationStatus?: "none" | "pending" | "running" | "complete";
  compact?: boolean;
}

export function DashboardTrustBadge({
  trustGrade,
  verificationStatus = "none",
  compact = false,
}: Props): JSX.Element | null {
  if (verificationStatus === "none" || verificationStatus === "pending") {
    return (
      <span
        className="inline-flex items-center rounded-full border border-border-muted bg-bg-elevated px-2 py-0.5 text-[10px] text-text-dim"
        data-testid="dashboard-trust-pending"
        title="Verification pending"
      >
        Verify pending
      </span>
    );
  }

  if (verificationStatus === "running") {
    return (
      <span
        className="inline-flex items-center rounded-full border border-brand-violet/30 bg-brand-violet/10 px-2 py-0.5 text-[10px] text-brand-violetLight"
        data-testid="dashboard-trust-running"
      >
        Verifying…
      </span>
    );
  }

  if (trustGrade == null) return null;

  return (
    <span
      className="group/trust relative inline-flex cursor-default items-center gap-1 rounded-full border border-brand-violet/30 bg-brand-violet/10 px-2 py-0.5 text-[10px] font-semibold text-brand-violetLight"
      data-testid="dashboard-trust-grade"
    >
      Trust {trustGrade}
      {!compact ? (
        <span
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-44 -translate-x-1/2 rounded border border-border-muted bg-bg-panel p-2 text-[10px] font-normal text-text-secondary shadow-lg group-hover/trust:block"
          data-testid="dashboard-trust-breakdown"
        >
          Trust Grade breakdown available in workspace verification panel.
        </span>
      ) : null}
    </span>
  );
}
