import { AlertTriangle, BookOpen, BrainCircuit } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { MyProjectCard } from "@/components/dashboard/MyProjectCard";
import { TopArchCard } from "@/components/dashboard/TopArchCard";
import { ResumeSessionCard } from "@/components/dashboard/ResumeSessionCard";
import type { InterrogationSessionSummary } from "@architectai/shared";
import { listArchitectures, listInterrogationSessions, type ArchitectureSummary } from "@/lib/api";

export default function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ArchitectureSummary[]>([]);
  const [activeSessions, setActiveSessions] = useState<InterrogationSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listArchitectures().then((r) => setRows(r.rows)),
      listInterrogationSessions({ status: "active", limit: 6 }).then(setActiveSessions),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const onNew = useCallback(() => navigate("/"), [navigate]);
  const hasUrgent = rows.some((r) => r.openDriftCount > 0 || r.driftScore > 10);
  const top = [...rows].sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, 6);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base text-text-muted">
        Loading dashboard…
      </div>
    );
  }

  return (
    <DashboardShell onNewArchitecture={onNew}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        {hasUrgent ? (
          <div
            className="mb-6 flex items-center gap-2 rounded-xl border border-[#ef4444]/20 bg-[#ef4444]/5 px-3 py-2 text-xs text-[#ef4444]"
            data-testid="urgency-banner"
          >
            <AlertTriangle size={13} />
            1 project requires immediate attention — sorted by urgency
          </div>
        ) : null}

        {activeSessions.length > 0 ? (
          <section className="mb-10" data-testid="dashboard-resume-sessions">
            <h2 className="mb-4 text-lg font-semibold text-white">Resume interrogation</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {activeSessions.map((s) => (
                <ResumeSessionCard key={s.sessionId} session={s} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">My Projects</h2>
            <button
              type="button"
              className="rounded-lg border border-brand-violet/40 px-3 py-1 text-xs text-brand-violet"
              onClick={onNew}
            >
              New project
            </button>
          </div>
          {rows.length === 0 ? (
            <div
              className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border-muted py-16"
              data-testid="dashboard-empty-state"
            >
              <BrainCircuit className="text-brand-violet" size={32} />
              <div className="text-center">
                <p className="text-sm font-medium text-text-secondary">No architectures yet</p>
                <p className="mt-1 text-xs text-text-muted">
                  Start an interrogation to generate your first governed architecture.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg bg-brand-violet px-4 py-2 text-sm font-medium text-white hover:bg-brand-violet/90"
                data-testid="dashboard-empty-cta"
                onClick={onNew}
              >
                Start new architecture
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="my-projects-grid">
              {rows.slice(0, 6).map((arch) => (
                <MyProjectCard key={arch.id} arch={arch} />
              ))}
            </div>
          )}
        </section>

        <div className="mb-8 flex items-center gap-3 text-xs text-text-dim">
          <hr className="flex-1 border-border-muted" />
          <BookOpen size={14} />
          <span>Explore top architectures</span>
          <hr className="flex-1 border-border-muted" />
        </div>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-white">Top Architectures</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="top-arch-grid">
            {top.map((arch) => (
              <TopArchCard key={`top-${arch.id}`} arch={arch} />
            ))}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
