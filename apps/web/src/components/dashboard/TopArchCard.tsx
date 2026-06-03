import { ChevronRight, Clock, Star, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import type { ArchitectureSummary } from "@/lib/api";
import { DashboardTrustBadge } from "@/components/dashboard/DashboardTrustBadge";

export function TopArchCard({ arch }: { arch: ArchitectureSummary }): JSX.Element {
  return (
    <Link
      to={`/workspace/${arch.id}`}
      className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-border-muted bg-bg-panel p-4 hover:border-[#2a3050] hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
      data-testid={`top-arch-card-${arch.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-white">{arch.name}</h3>
          <p className="text-[11px] text-text-muted">Team · ArchitectAI</p>
        </div>
        <span className="flex items-center gap-1 rounded-lg border border-[#10b981]/20 bg-[#10b981]/10 px-2 py-1 text-[11px] font-bold text-[#10b981]">
          <TrendingUp size={9} />
          {arch.confidenceScore}%
        </span>
      </div>
      <DashboardTrustBadge
        trustGrade={arch.trustGrade}
        verificationStatus={arch.verificationStatus}
        compact
      />
      <p className="line-clamp-2 text-[12px] leading-relaxed text-text-muted">
        {arch.description || "Governed architecture with decision lineage."}
      </p>
      <div className="flex flex-wrap items-center gap-2 border-t border-[#1f2333] pt-3 text-[10px] text-text-dim">
        <span className="rounded bg-[#1f2333] px-2 py-0.5">{arch.environmentTarget}</span>
        <span className="rounded bg-[#1f2333] px-2 py-0.5">{arch.totalServices} services</span>
        <span className="flex items-center gap-1">
          <Clock size={9} /> Updated
        </span>
        <span className="ml-auto flex items-center gap-1 text-[#f59e0b]">
          <Star size={10} /> 4.8
        </span>
        <span className="hidden items-center gap-0.5 text-[#818cf8] group-hover:flex">
          View <ChevronRight size={10} />
        </span>
      </div>
    </Link>
  );
}
