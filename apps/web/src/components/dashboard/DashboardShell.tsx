import { BrainCircuit, Plus } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { KbdHint } from "@/components/ui/KbdHint";

interface DashboardShellProps {
  children: ReactNode;
  onNewArchitecture: () => void;
}

export function DashboardShell({
  children,
  onNewArchitecture,
}: DashboardShellProps): JSX.Element {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        onNewArchitecture();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNewArchitecture]);

  return (
    <div className="flex min-h-screen flex-col bg-bg-base" data-testid="dashboard-page">
      <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-border-muted bg-bg-base px-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BrainCircuit size={18} className="text-brand-violet" />
          ArchitectAI
        </div>
        <div className="mx-auto flex max-w-md flex-1">
          <input
            ref={searchRef}
            data-testid="dashboard-search"
            placeholder="Search projects, services, repos..."
            className="w-full rounded-lg border border-border-muted bg-bg-panel px-3 py-1.5 text-sm text-text-primary placeholder:text-text-dim"
          />
          <span className="ml-2 self-center">
            <KbdHint keys={["⌘", "K"]} />
          </span>
        </div>
        <button
          type="button"
          data-testid="new-architecture-btn"
          className="flex items-center gap-1 rounded-lg bg-brand-violet px-3 py-1.5 text-sm font-medium text-white"
          onClick={onNewArchitecture}
        >
          <Plus size={14} /> New Architecture
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside
          className="flex w-[188px] shrink-0 flex-col border-r border-border-muted bg-bg-base p-3 text-[13px]"
          data-testid="dashboard-sidebar"
        >
          <nav className="flex flex-col gap-1">
            <span className="rounded-lg bg-bg-elevated px-3 py-2 font-medium text-white">
              Workspace
            </span>
            <span className="px-3 py-2 text-text-muted">Governance</span>
            <span className="flex items-center justify-between px-3 py-2 text-text-muted">
              Drift Center
              <span
                className="rounded-full bg-status-red px-1.5 text-[10px] text-white"
                data-testid="drift-center-badge"
              >
                3
              </span>
            </span>
          </nav>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
