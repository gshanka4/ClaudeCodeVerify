import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Cloud,
  Loader2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ApiClientError, fetchIdeHandoff, type ArchitectureSummary } from "@/lib/api";
import { exportWizardPath, ideLabel, isExportableStatus, launchIdeHandoff, type IdeTarget } from "@/lib/ide";
import { DashboardTrustBadge } from "@/components/dashboard/DashboardTrustBadge";

export type ProjectCardStatus = "building" | "production" | "drift" | "review";

function deriveStatus(arch: ArchitectureSummary): ProjectCardStatus {
  if (arch.openDriftCount > 0 || arch.driftScore > 10) return "drift";
  if (arch.status === "generating" || arch.status === "interrogating") return "building";
  if (arch.status === "ready") return "production";
  return "review";
}

const STATUS_META: Record<
  ProjectCardStatus,
  { label: string; color: string; bg: string; testId: string }
> = {
  building: {
    label: "In Build",
    color: "#6366f1",
    bg: "rgba(99,102,241,0.12)",
    testId: "architecture-status-building",
  },
  production: {
    label: "Ready",
    color: "#10b981",
    bg: "rgba(16,185,129,0.12)",
    testId: "architecture-status-ready",
  },
  drift: {
    label: "Drift Detected",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.12)",
    testId: "architecture-status-drift",
  },
  review: {
    label: "Governance Review",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    testId: "architecture-status-review",
  },
};

function MiniBar({ value, color }: { value: number; color: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2 text-[11px] text-text-muted">
      <div className="h-[3px] flex-1 rounded bg-[#1f2333]">
        <div className="h-full rounded" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span>{value}%</span>
    </div>
  );
}

function formatActivity(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ArchitectureCard({ arch }: { arch: ArchitectureSummary }): JSX.Element {
  const navigate = useNavigate();
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  const status = deriveStatus(arch);
  const meta = STATUS_META[status];
  const isBuilding = arch.status === "generating" || arch.status === "interrogating";
  const canExport = isExportableStatus(arch.status);
  const ide: IdeTarget = arch.lastExportIde ?? "claude-code";
  const canOpenIde = Boolean(arch.lastExportIde && arch.lastWorkspaceId);
  const exportHref = exportWizardPath(arch.id, ide);
  const activityAt = arch.lastActivityAt ?? arch.updatedAt;

  const onOpenIde = async () => {
    if (ide === "claude-code") {
      navigate(`/workspace/${arch.id}`);
      return;
    }
    setHandoffBusy(true);
    setHandoffError(null);
    try {
      const handoff = await fetchIdeHandoff(arch.id, arch.lastExportIde ?? undefined);
      const mode = launchIdeHandoff(handoff.deepLink, handoff.ide);
      if (mode === "copy-only") {
        await navigator.clipboard.writeText(handoff.deepLink);
        setHandoffError("Legacy link copied — open your IDE manually.");
      }
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        navigate("/");
        return;
      }
      if (e instanceof ApiClientError && e.status === 409) {
        navigate(exportHref);
        return;
      }
      setHandoffError(e instanceof Error ? e.message : "Could not open legacy IDE");
    } finally {
      setHandoffBusy(false);
    }
  };

  return (
    <article
      className="group flex flex-col overflow-hidden rounded-xl border border-border-muted bg-bg-panel hover:border-[#2a3050] hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
      data-testid={`architecture-card-${arch.id}`}
    >
      <div className="h-[2px]" style={{ backgroundColor: meta.color }} />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {status === "production" ? (
                <CheckCircle2 size={14} className="shrink-0 text-status-green" aria-hidden />
              ) : isBuilding ? (
                <Loader2 size={14} className="shrink-0 animate-spin text-brand-violet" aria-hidden />
              ) : status === "drift" ? (
                <AlertTriangle size={14} className="shrink-0 text-status-red" aria-hidden />
              ) : null}
              <h3 className="truncate text-[14px] font-semibold text-white">{arch.name}</h3>
            </div>
            <p className="mt-0.5 text-[10px] text-text-dim" data-testid="architecture-card-subtext">
              {arch.lastExportIde
                ? `Last export · ${ideLabel(arch.lastExportIde)} · `
                : "No export yet · "}
              {formatActivity(activityAt)}
            </p>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ color: meta.color, backgroundColor: meta.bg }}
            data-testid={meta.testId}
          >
            {meta.label}
          </span>
        </div>
        <DashboardTrustBadge
          trustGrade={arch.trustGrade}
          verificationStatus={arch.verificationStatus}
        />
        <MiniBar value={arch.confidenceScore} color="#10b981" />
        <MiniBar value={arch.governanceScore} color="#818cf8" />
        {arch.openDriftCount > 0 ? (
          <p
            className="flex items-center gap-1.5 rounded-lg border border-[#ef4444]/18 bg-[#ef4444]/8 px-2.5 py-1.5 text-[11px] text-[#ef4444]"
            data-testid="drift-notice"
          >
            <AlertTriangle size={11} />
            {arch.openDriftCount} drift incident(s) require review
          </p>
        ) : null}
        {handoffError ? (
          <p className="text-[10px] text-status-amber" data-testid="architecture-card-handoff-error">
            {handoffError}
          </p>
        ) : null}
        <div className="flex items-center gap-3 border-t border-[#1f2333] pt-3 text-[10px] text-text-dim">
          <span className="flex items-center gap-1">
            <Cloud size={10} /> {arch.environmentTarget}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={10} /> v{arch.version}
          </span>
        </div>
      </div>
      <div className="flex divide-x divide-[#1f2333] border-t border-[#1f2333] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        {isBuilding ? (
          <span
            className="flex flex-1 items-center justify-center gap-1 py-2 text-[11px] text-text-dim"
            data-testid="architecture-card-open-disabled"
          >
            <Loader2 size={11} className="animate-spin" /> Generating…
          </span>
        ) : (
          <Link
            to={`/workspace/${arch.id}`}
            className="flex flex-1 items-center justify-center gap-1 py-2 text-[11px] text-[#818cf8]"
            data-testid="architecture-card-open"
          >
            <ArrowUpRight size={11} /> Open
          </Link>
        )}
        {canOpenIde ? (
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-1 py-2 text-[11px] text-[#818cf8] disabled:opacity-50"
            data-testid={`architecture-card-open-ide-${ide}`}
            disabled={handoffBusy || isBuilding}
            onClick={() => void onOpenIde()}
          >
            <ArrowUpRight size={11} />{" "}
            {ide === "claude-code" ? "Open repo setup" : `Open in ${ideLabel(ide)}`}
          </button>
        ) : (
          <Link
            to={canExport ? exportHref : `/workspace/${arch.id}`}
            className={`flex flex-1 items-center justify-center gap-1 py-2 text-[11px] ${
              canExport && !isBuilding ? "text-[#818cf8]" : "pointer-events-none text-text-dim opacity-50"
            }`}
            data-testid="architecture-card-export"
            aria-disabled={!canExport || isBuilding}
          >
            Export to repo
          </Link>
        )}
      </div>
    </article>
  );
}
