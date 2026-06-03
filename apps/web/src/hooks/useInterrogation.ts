import { useCallback, useRef, useState } from "react";
import type { InterrogationQuestion } from "@architectai/shared";
import * as api from "@/lib/api";
import { EDIT_ANSWER_NOTICE_MS } from "@/lib/ui-timing";
import { useSessionStore } from "@/stores/useSessionStore";

/** Debounce window for rapid option clicks / key repeats (B-EC rapid 1–4). */
export const SUBMIT_DEBOUNCE_MS = 300;

export function useInterrogation(sessionId: string | undefined) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const store = useSessionStore();
  const submitGuard = useRef(false);
  const lastSubmitAt = useRef(0);

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const session = await api.getInterrogationSession(sessionId);
      const pending =
        session.questions.find((q) => q.status === "pending") ?? null;
      store.hydrateSession(session, pending);
    } catch (e) {
      setError(e instanceof api.ApiClientError ? e.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [sessionId, store]);

  const applyResult = useCallback(
    (
      questionId: string,
      result: {
        nextQuestion: InterrogationQuestion | null;
        sessionProgress: {
          contextGathering: number;
          governanceCoverage: number;
          questionsRemaining: number;
        };
        canGenerate: boolean;
        sessionComplete?: boolean;
      },
      patch?: Partial<InterrogationQuestion>,
    ) => {
      const answered = store.session?.questions ?? [];
      const updated = answered.map((q) =>
        q.id === questionId
          ? {
              ...q,
              status: "answered" as const,
              answeredAt: new Date(),
              ...patch,
            }
          : q,
      );
      if (result.nextQuestion) updated.push(result.nextQuestion);
      store.setQuestions(updated);
      store.applyAnswerResult(
        result.nextQuestion,
        result.sessionProgress,
        result.canGenerate,
        Boolean(result.sessionComplete),
      );
      store.touchAutosave();
    },
    [store],
  );

  const submitAnswer = useCallback(
    async (
      questionId: string,
      payload: { selectedOptionId?: string; freeformAnswer?: string },
    ) => {
      if (!sessionId) return;
      setError(null);
      const answered = store.session?.questions ?? [];
      const current = answered.find((q) => q.id === questionId);
      const nextPending = answered.find(
        (q) =>
          q.status === "pending" &&
          current != null &&
          q.index > current.index,
      );
      if (nextPending && current) {
        const optimistic = answered.map((q) =>
          q.id === questionId
            ? {
                ...q,
                status: "answered" as const,
                selectedOptionId: payload.selectedOptionId ?? null,
                freeformAnswer: payload.freeformAnswer?.trim() ?? null,
                answeredAt: new Date(),
              }
            : q,
        );
        const resolved = optimistic.filter(
          (q) => q.status === "answered" || q.status === "skipped",
        ).length;
        store.setQuestions(optimistic);
        store.applyAnswerResult(
          nextPending,
          {
            contextGathering: Math.min(100, Math.round((resolved / optimistic.length) * 100)),
            governanceCoverage: store.session?.governanceCoverageProgress ?? 0,
            questionsRemaining: Math.max(0, optimistic.length - resolved),
          },
          false,
          false,
        );
      }
      setLoading(true);
      try {
        const result = await api.answerQuestion(sessionId, {
          questionId,
          ...payload,
        });
        applyResult(questionId, result, {
          selectedOptionId: payload.selectedOptionId ?? null,
          freeformAnswer: payload.freeformAnswer?.trim() ?? null,
        });
        return result;
      } catch (e) {
        setError(e instanceof api.ApiClientError ? e.message : "Failed to submit answer");
        void loadSession();
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [sessionId, applyResult, store, loadSession],
  );

  const skip = useCallback(
    async (questionId: string) => {
      if (!sessionId) return;
      setLoading(true);
      setError(null);
      try {
        const result = await api.skipQuestion(sessionId, questionId);
        const updated = (store.session?.questions ?? []).map((q) =>
          q.id === questionId ? { ...q, status: "skipped" as const, answeredAt: new Date() } : q,
        );
        if (result.nextQuestion) updated.push(result.nextQuestion);
        store.setQuestions(updated);
        store.applyAnswerResult(
          result.nextQuestion,
          {
            contextGathering: store.session?.contextGatheringProgress ?? 0,
            governanceCoverage: store.session?.governanceCoverageProgress ?? 0,
            questionsRemaining: 0,
          },
          result.canGenerate,
          Boolean(result.sessionComplete),
        );
        store.touchAutosave();
      } catch (e) {
        setError(e instanceof api.ApiClientError ? e.message : "Failed to skip question");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [sessionId, store],
  );

  const editAnswer = useCallback(
    async (
      questionId: string,
      payload: { selectedOptionId?: string; freeformAnswer?: string },
    ) => {
      if (!sessionId) return;
      setLoading(true);
      try {
        const result = await api.editQuestion(sessionId, questionId, payload);
        store.setQuestions(result.questions);
        store.setEditingQuestionId(null);
        store.touchAutosave();
        setEditNotice("Answer updated");
        window.setTimeout(() => setEditNotice(null), EDIT_ANSWER_NOTICE_MS);
      } finally {
        setLoading(false);
      }
    },
    [sessionId, store],
  );

  /** Phase B: click option → submit → next question (not used in edit mode). */
  const selectAndSubmitAnswer = useCallback(
    async (questionId: string, selectedOptionId: string, freeform?: string) => {
      if (!sessionId || submitGuard.current) return;
      const now = Date.now();
      if (now - lastSubmitAt.current < SUBMIT_DEBOUNCE_MS) return;
      submitGuard.current = true;
      lastSubmitAt.current = now;
      try {
        await submitAnswer(questionId, {
          selectedOptionId,
          freeformAnswer: freeform,
        });
      } catch {
        /* submitAnswer sets error */
      } finally {
        submitGuard.current = false;
      }
    },
    [sessionId, submitAnswer],
  );

  /** Phase H: typed answer → explicit submit (no option id). */
  const submitFreeformAnswer = useCallback(
    async (questionId: string, text: string) => {
      const trimmed = text.trim();
      if (!sessionId || !trimmed) return;
      if (submitGuard.current) return;
      submitGuard.current = true;
      lastSubmitAt.current = Date.now();
      try {
        await submitAnswer(questionId, { freeformAnswer: trimmed });
      } catch {
        /* submitAnswer sets error */
      } finally {
        submitGuard.current = false;
      }
    },
    [sessionId, submitAnswer],
  );

  return {
    loading,
    error,
    setError,
    editNotice,
    loadSession,
    submitAnswer,
    selectAndSubmitAnswer,
    submitFreeformAnswer,
    skip,
    editAnswer,
  };
}

export function findAnsweredQuestions(questions: InterrogationQuestion[]): InterrogationQuestion[] {
  return questions.filter((q) => q.status === "answered" || q.status === "skipped");
}
