import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Maximize2 } from "lucide-react";
import { DriftWorkspaceEducationModal } from "@/components/export/DriftWorkspaceEducationModal";
import { ExportEducationModal } from "@/components/export/ExportEducationModal";
import { WorkspaceCoachMarks } from "@/components/journey/WorkspaceCoachMarks";
import { ClaudeCodeSetupModal } from "@/components/export/ClaudeCodeSetupModal";
import { IdePickerModal } from "@/components/export/IdePickerModal";
import { hasSeenExportEducation } from "@/lib/onboarding-flags";
import { ArchitectureCanvas } from "@/components/workspace/ArchitectureCanvas";
import { LineageGraphStage } from "@/components/workspace/LineageGraphStage";
import { LockArchitectureCta } from "@/components/workspace/LockArchitectureCta";
import { TrustGradeBadge } from "@/components/workspace/TrustGradeBadge";
import { ReasoningPanel } from "@/components/workspace/ReasoningPanel";
import { ReExportToast } from "@/components/workspace/ReExportToast";
import { WorkspaceToolbar } from "@/components/workspace/WorkspaceToolbar";
import { Button } from "@/components/ui/Button";
import type { ArchitectureDetailResponse } from "@/lib/api";
import { getArchitectureDetail } from "@/lib/api";
import { isExportableStatus } from "@/lib/ide";
import { EXPORT_PRIMARY_CTA } from "@/lib/product-copy";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

export default function WorkspacePage(): JSX.Element {
  const { architectureId } = useParams<{ architectureId: string }>();
  const [detail, setDetail] = useState<ArchitectureDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockedVersion, setLockedVersion] = useState<number | null>(null);
  const [exportEducationOpen, setExportEducationOpen] = useState(false);
  const [claudeCodeSetupOpen, setClaudeCodeSetupOpen] = useState(false);
  const [driftEducationOpen, setDriftEducationOpen] = useState(false);

  const lineageGraphOpen = useWorkspaceStore((s) => s.lineageGraphOpen);
  const openLineageGraph = useWorkspaceStore((s) => s.openLineageGraph);
  const focusMode = useWorkspaceStore((s) => s.focusMode);
  const setFocusMode = useWorkspaceStore((s) => s.setFocusMode);
  const exportPickerOpen = useWorkspaceStore((s) => s.exportPickerOpen);
  const setExportPickerOpen = useWorkspaceStore((s) => s.setExportPickerOpen);

  const openPrimaryExport = useCallback(() => {
    if (hasSeenExportEducation()) setClaudeCodeSetupOpen(true);
    else setExportEducationOpen(true);
  }, []);
  const loadVerification = useWorkspaceStore((s) => s.loadVerification);
  const clearVerification = useWorkspaceStore((s) => s.clearVerification);
  const trustGrade = useWorkspaceStore((s) => s.trustGrade);
  const verificationLoading = useWorkspaceStore((s) => s.verificationLoading);

  const refreshDetail = useCallback(() => {
    if (!architectureId) return;
    getArchitectureDetail(architectureId)
      .then(setDetail)
      .catch((e: Error) => setError(e.message));
  }, [architectureId]);

  useEffect(() => {
    refreshDetail();
  }, [refreshDetail]);

  useEffect(() => {
    if (!detail || detail.status !== "ready") return;
    if (!hasSeenDriftWorkspaceEducation()) {
      setDriftEducationOpen(true);
    }
  }, [detail?.status, detail?.id]);

  useEffect(() => {
    if (!architectureId) return;
    void loadVerification(architectureId);
    return () => clearVerification();
  }, [architectureId, loadVerification, clearVerification]);

  if (!architectureId) {
    return <p className="p-8 text-text-muted">Missing architecture id.</p>;
  }

  if (error && !detail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-base">
        <p className="text-status-red">{error}</p>
        <Link to="/" className="text-sm text-brand-violet">
          Back to landing
        </Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base text-text-muted">
        Loading workspace…
      </div>
    );
  }

  const canExport = isExportableStatus(detail.status);
  const displayVersion = lockedVersion ?? detail.version;
  const isGenerating = detail.status === "generating";

  return (
    <div
      className="flex h-screen flex-col bg-bg-surface text-text-primary"
      data-testid="workspace-page"
    >
      {isGenerating ? (
        <div
          className="shrink-0 border-b border-status-amber/30 bg-status-amber/10 px-4 py-2 text-center text-sm text-status-amber"
          data-testid="workspace-generating-banner"
          role="status"
        >
          Generation in progress — canvas may update as services are added.
        </div>
      ) : null}

      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-muted bg-bg-surface px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{detail.name}</span>
          <span className="text-xs text-text-dim">v{displayVersion}</span>
        </div>
        {detail.governanceIssues.length > 0 ? (
          <p className="hidden text-xs text-status-amber sm:block" data-testid="header-triage">
            {detail.governanceIssues.length} issues · Confidence {detail.confidenceScore}%
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <TrustGradeBadge trustGrade={trustGrade} loading={verificationLoading} />
          <button
            type="button"
            className="rounded p-1 text-text-muted hover:bg-bg-elevated"
            title="Focus mode"
            onClick={() => setFocusMode(!focusMode)}
          >
            <Maximize2 size={16} />
          </button>
          {canExport ? (
            <LockArchitectureCta
              architectureId={architectureId}
              version={detail.version}
              onLocked={(v) => setLockedVersion(v)}
            />
          ) : null}
          <Button
            data-testid="workspace-header-export-btn"
            disabled={!canExport}
            title={isGenerating ? "Wait for generation to finish before exporting" : undefined}
            onClick={openPrimaryExport}
          >
            {EXPORT_PRIMARY_CTA}
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <WorkspaceToolbar exportDisabled={!canExport} onExportClick={openPrimaryExport} />
        <main
          className={`relative min-h-0 min-w-0 flex-1 ${focusMode ? "bg-bg-base/80" : ""}`}
          data-testid="workspace-main-stage"
          data-workspace-stage={lineageGraphOpen ? "lineage" : "canvas"}
        >
          {lineageGraphOpen ? (
            <LineageGraphStage architectureId={architectureId} />
          ) : (
            <>
              <ArchitectureCanvas detail={detail} />
              <WorkspaceCoachMarks
                architectureId={architectureId}
                onOpenLineage={() => openLineageGraph()}
              />
            </>
          )}
        </main>
        <aside
          className="flex h-72 w-full shrink-0 flex-col border-t border-border-muted bg-bg-panel lg:h-auto lg:w-80 lg:border-l lg:border-t-0"
          data-testid="workspace-right-panel"
        >
          <ReasoningPanel architectureId={architectureId} detail={detail} />
        </aside>
      </div>

      <ReExportToast />

      <DriftWorkspaceEducationModal
        open={driftEducationOpen}
        onContinue={() => setDriftEducationOpen(false)}
      />

      <ExportEducationModal
        open={exportEducationOpen}
        onContinue={() => {
          setExportEducationOpen(false);
          setClaudeCodeSetupOpen(true);
        }}
        onClose={() => setExportEducationOpen(false)}
      />

      <ClaudeCodeSetupModal
        open={claudeCodeSetupOpen}
        architectureId={architectureId}
        exportDisabled={!canExport}
        onClose={() => setClaudeCodeSetupOpen(false)}
        onOpenLegacyPicker={() => {
          setClaudeCodeSetupOpen(false);
          setExportPickerOpen(true);
        }}
      />

      <IdePickerModal
        open={exportPickerOpen}
        architectureId={architectureId}
        exportDisabled={!canExport}
        onClose={() => setExportPickerOpen(false)}
      />
    </div>
  );
}
