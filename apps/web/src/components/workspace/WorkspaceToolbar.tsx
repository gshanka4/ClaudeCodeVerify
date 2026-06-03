import {
  Download,
  GitBranch,
  Grid3x3,
  Layers,
  Maximize2,
  MousePointer2,
  Move,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

const iconBtn =
  "flex h-9 w-9 items-center justify-center rounded-lg text-text-ghost hover:bg-bg-elevated hover:text-text-primary";

interface WorkspaceToolbarProps {
  exportDisabled?: boolean;
  /** Primary path: Claude Code repo export (education → setup modal). */
  onExportClick?: () => void;
}

export function WorkspaceToolbar({
  exportDisabled = false,
  onExportClick,
}: WorkspaceToolbarProps): JSX.Element {
  const toggleLineageGraph = useWorkspaceStore((s) => s.toggleLineageGraph);
  const lineageGraphOpen = useWorkspaceStore((s) => s.lineageGraphOpen);
  const setFocusMode = useWorkspaceStore((s) => s.setFocusMode);
  const focusMode = useWorkspaceStore((s) => s.focusMode);

  return (
    <aside
      className="flex w-12 shrink-0 flex-col items-center border-r border-border-muted bg-bg-surface py-2"
      data-testid="workspace-toolbar"
    >
      <div className="flex flex-col gap-1">
        <button type="button" className={`${iconBtn} bg-bg-elevated text-brand-violet`} title="Select">
          <MousePointer2 size={16} />
        </button>
        <button type="button" className={iconBtn} title="Zoom in">
          <ZoomIn size={16} />
        </button>
        <button type="button" className={iconBtn} title="Zoom out">
          <ZoomOut size={16} />
        </button>
        <button type="button" className={iconBtn} title="Pan">
          <Move size={16} />
        </button>
        <button
          type="button"
          className={iconBtn}
          title="Focus mode"
          onClick={() => setFocusMode(!focusMode)}
        >
          <Maximize2 size={16} />
        </button>
      </div>
      <div className="mt-auto flex flex-col gap-1">
        <button type="button" className={iconBtn} title="Layers">
          <Layers size={16} />
        </button>
        <button type="button" className={iconBtn} title="Grid">
          <Grid3x3 size={16} />
        </button>
        <button
          type="button"
          className={`${iconBtn} ${lineageGraphOpen ? "bg-bg-elevated text-brand-violet" : ""}`}
          title="Lineage graph"
          data-testid="lineage-graph-toggle"
          onClick={toggleLineageGraph}
        >
          <GitBranch size={16} />
        </button>
        <button
          type="button"
          className={iconBtn}
          title="Export to repo (Claude Code)"
          data-testid="workspace-export-btn"
          disabled={exportDisabled || !onExportClick}
          onClick={() => onExportClick?.()}
        >
          <Download size={16} />
        </button>
      </div>
    </aside>
  );
}
