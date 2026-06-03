import type { InterrogationQuestion, InterrogationSession } from "@architectai/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SessionProgress {
  contextGathering: number;
  governanceCoverage: number;
  questionsRemaining: number;
}

interface SessionState {
  sessionId: string | null;
  session: InterrogationSession | null;
  currentQuestion: InterrogationQuestion | null;
  canGenerate: boolean;
  sessionComplete: boolean;
  generationArchitectureId: string | null;
  lastAutosavedAt: string | null;
  editingQuestionId: string | null;
  setFromStart: (
    sessionId: string,
    session: InterrogationSession,
    firstQuestion: InterrogationQuestion,
  ) => void;
  hydrateSession: (session: InterrogationSession, pending: InterrogationQuestion | null) => void;
  applyAnswerResult: (
    nextQuestion: InterrogationQuestion | null,
    progress: SessionProgress,
    canGenerate: boolean,
    sessionComplete: boolean,
  ) => void;
  setGenerationArchitectureId: (id: string | null) => void;
  setQuestions: (questions: InterrogationQuestion[]) => void;
  setEditingQuestionId: (id: string | null) => void;
  touchAutosave: () => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      sessionId: null,
      session: null,
      currentQuestion: null,
      canGenerate: false,
      sessionComplete: false,
      generationArchitectureId: null,
      lastAutosavedAt: null,
      editingQuestionId: null,

      setFromStart: (sessionId, session, firstQuestion) =>
        set({
          sessionId,
          session,
          currentQuestion: firstQuestion,
          canGenerate: false,
          sessionComplete: false,
          generationArchitectureId: null,
          lastAutosavedAt: new Date().toISOString(),
          editingQuestionId: null,
        }),

      hydrateSession: (session, pending) =>
        set({
          sessionId: session.id,
          session,
          currentQuestion: pending,
          canGenerate: session.status === "complete",
          sessionComplete: session.status === "complete",
          generationArchitectureId:
            session.linkedArchitectureStatus === "generating"
              ? session.architectureId
              : null,
        }),

      applyAnswerResult: (nextQuestion, progress, canGenerate, sessionComplete) =>
        set((state) => ({
          currentQuestion: nextQuestion,
          canGenerate,
          sessionComplete,
          lastAutosavedAt: new Date().toISOString(),
          session: state.session
            ? {
                ...state.session,
                status: sessionComplete ? "complete" : state.session.status,
                completedAt: sessionComplete ? new Date() : state.session.completedAt,
                contextGatheringProgress: progress.contextGathering,
                governanceCoverageProgress: progress.governanceCoverage,
              }
            : null,
        })),

      setGenerationArchitectureId: (id) => set({ generationArchitectureId: id }),

      setQuestions: (questions) =>
        set((state) =>
          state.session ? { session: { ...state.session, questions } } : {},
        ),

      setEditingQuestionId: (id) => set({ editingQuestionId: id }),
      touchAutosave: () => set({ lastAutosavedAt: new Date().toISOString() }),
      reset: () =>
        set({
          sessionId: null,
          session: null,
          currentQuestion: null,
          canGenerate: false,
          sessionComplete: false,
          generationArchitectureId: null,
          lastAutosavedAt: null,
          editingQuestionId: null,
        }),
    }),
    { name: "architectai-session" },
  ),
);
