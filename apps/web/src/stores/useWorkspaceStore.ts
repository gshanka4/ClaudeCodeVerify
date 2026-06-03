import type {
  ComponentVerdictRollup,
  TrustGradeBreakdown,
  VerificationSummary,
  VerificationVerdict,
} from "@architectai/shared";
import { create } from "zustand";
import { getVerificationSummary } from "@/lib/api";

interface WorkspaceState {
  selectedServiceId: string | null;
  lineageGraphOpen: boolean;
  lineageGraphShowAll: boolean;
  focusMode: boolean;
  exportPickerOpen: boolean;
  expandedTraceSteps: Set<string>;
  expandedCriticalDecisionId: string | null;
  reExportMessage: string | null;
  lineageOpenTriggerId: string | null;
  verificationRunId: string | null;
  verificationLoading: boolean;
  verificationError: string | null;
  trustGrade: TrustGradeBreakdown | null;
  componentVerdicts: Record<string, VerificationVerdict>;
  verificationFindings: VerificationSummary["findings"];
  showAdvisorySignals: boolean;
  setShowAdvisorySignals: (show: boolean) => void;
  setSelectedServiceId: (id: string | null) => void;
  openLineageGraph: (triggerId?: string) => void;
  closeLineageGraph: () => void;
  toggleLineageGraph: () => void;
  setLineageGraphShowAll: (showAll: boolean) => void;
  setFocusMode: (on: boolean) => void;
  setExportPickerOpen: (open: boolean) => void;
  toggleTraceStep: (key: string) => void;
  setExpandedCriticalDecisionId: (id: string | null) => void;
  setReExportMessage: (message: string | null) => void;
  applyVerificationSummary: (summary: VerificationSummary) => void;
  loadVerification: (architectureId: string) => Promise<void>;
  clearVerification: () => void;
}

function rollupsToMap(rollups: ComponentVerdictRollup[]): Record<string, VerificationVerdict> {
  const map: Record<string, VerificationVerdict> = {};
  for (const r of rollups) map[r.serviceId] = r.verdict;
  return map;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  selectedServiceId: null,
  lineageGraphOpen: false,
  lineageGraphShowAll: false,
  focusMode: false,
  exportPickerOpen: false,
  expandedTraceSteps: new Set(),
  expandedCriticalDecisionId: null,
  reExportMessage: null,
  lineageOpenTriggerId: null,
  verificationRunId: null,
  verificationLoading: false,
  verificationError: null,
  trustGrade: null,
  componentVerdicts: {},
  verificationFindings: [],
  showAdvisorySignals: true,
  setSelectedServiceId: (id) =>
    set({
      selectedServiceId: id,
      expandedTraceSteps: new Set(),
      expandedCriticalDecisionId: id,
    }),
  openLineageGraph: (triggerId) =>
    set({
      lineageGraphOpen: true,
      lineageGraphShowAll: false,
      lineageOpenTriggerId: triggerId ?? null,
    }),
  closeLineageGraph: () =>
    set({
      lineageGraphOpen: false,
      lineageGraphShowAll: false,
      lineageOpenTriggerId: null,
    }),
  toggleLineageGraph: () =>
    set((s) => ({
      lineageGraphOpen: !s.lineageGraphOpen,
      lineageGraphShowAll: s.lineageGraphOpen ? false : s.lineageGraphShowAll,
      lineageOpenTriggerId: s.lineageGraphOpen ? null : s.lineageOpenTriggerId,
    })),
  setLineageGraphShowAll: (showAll) => set({ lineageGraphShowAll: showAll }),
  setFocusMode: (on) => set({ focusMode: on }),
  setExportPickerOpen: (open) => set({ exportPickerOpen: open }),
  toggleTraceStep: (key) =>
    set((s) => {
      const next = new Set(s.expandedTraceSteps);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { expandedTraceSteps: next };
    }),
  setExpandedCriticalDecisionId: (id) => set({ expandedCriticalDecisionId: id }),
  setShowAdvisorySignals: (show) => set({ showAdvisorySignals: show }),
  setReExportMessage: (message) => set({ reExportMessage: message }),
  applyVerificationSummary: (summary) =>
    set({
      verificationRunId: summary.run.id,
      trustGrade: summary.trustGrade,
      componentVerdicts: rollupsToMap(summary.componentRollups),
      verificationFindings: summary.findings,
      verificationLoading: false,
      verificationError: null,
    }),
  loadVerification: async (architectureId) => {
    set({ verificationLoading: true, verificationError: null });
    try {
      const summary = await getVerificationSummary(architectureId);
      set({
        verificationRunId: summary.run.id,
        trustGrade: summary.trustGrade,
        componentVerdicts: rollupsToMap(summary.componentRollups),
        verificationFindings: summary.findings,
        verificationLoading: false,
        verificationError: null,
      });
    } catch (e) {
      set({
        verificationLoading: false,
        verificationError: e instanceof Error ? e.message : "Failed to load verification",
      });
    }
  },
  clearVerification: () =>
    set({
      verificationRunId: null,
      verificationLoading: false,
      verificationError: null,
      trustGrade: null,
      componentVerdicts: {},
      verificationFindings: [],
      showAdvisorySignals: true,
    }),
}));
