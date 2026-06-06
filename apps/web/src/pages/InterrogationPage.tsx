import { INTERROGATION } from "@architectai/config";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PreparingArchitectureBanner } from "@/components/interrogation/PreparingArchitectureBanner";
import { GenerationOverlay } from "@/components/generation/GenerationOverlay";
import { GenerationPendingOverlay } from "@/components/generation/GenerationPendingOverlay";
import { AnsweredRow } from "@/components/interrogation/AnsweredRow";
import { ImportContextBadge } from "@/components/interrogation/ImportContextBadge";
import { KeyboardLegend } from "@/components/interrogation/KeyboardLegend";
import { LockedPreview } from "@/components/interrogation/LockedPreview";
import { OptionCard } from "@/components/interrogation/OptionCard";
import { QuestionContext } from "@/components/interrogation/QuestionContext";
import { Button } from "@/components/ui/Button";
import { KbdHint } from "@/components/ui/KbdHint";
import { findAnsweredQuestions, useInterrogation } from "@/hooks/useInterrogation";
import { ApiClientError, startGeneration } from "@/lib/api";
import { isFreeformSubmitEnabled, shouldAutoStartGeneration } from "@/lib/interrogation-flow";
import { loadStoredImportContext } from "@/lib/import-context";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/useSessionStore";

export default function InterrogationPage(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const store = useSessionStore();
  const generationStartedRef = useRef(false);
  const overlayDismissedRef = useRef(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [startingGeneration, setStartingGeneration] = useState(false);

  const generatingFromQuery = searchParams.get("generating");
  const slowGeneration =
    searchParams.get("slowGen") === "1" || import.meta.env.VITE_GENERATION_SLOW === "1";
  const isOverlayDismissed = overlayDismissed || overlayDismissedRef.current;
  const overlayArchitectureId = isOverlayDismissed
    ? null
    : (store.generationArchitectureId ?? generatingFromQuery ?? null);

  const {
    loading,
    error,
    loadSession,
    selectAndSubmitAnswer,
    submitFreeformAnswer,
    skip,
    editAnswer,
    editNotice,
  } = useInterrogation(sessionId);

  const importContext = loadStoredImportContext();

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [freeform, setFreeform] = useState("");

  const session = store.session;
  const isEditing = Boolean(store.editingQuestionId);
  const current = store.editingQuestionId
    ? (session?.questions.find((q) => q.id === store.editingQuestionId) ?? store.currentQuestion)
    : store.currentQuestion;
  const answered = session ? findAnsweredQuestions(session.questions) : [];
  const freeformActive = freeform.trim().length > 0 && !isEditing;

  useEffect(() => {
    if (sessionId && (!store.sessionId || store.sessionId !== sessionId)) {
      void loadSession();
    }
  }, [sessionId, store.sessionId, loadSession]);

  useEffect(() => {
    return () => {
      setStartingGeneration(false);
    };
  }, []);

  useEffect(() => {
    if (isOverlayDismissed) return;
    if (generatingFromQuery && !store.generationArchitectureId) {
      store.setGenerationArchitectureId(generatingFromQuery);
    }
  }, [generatingFromQuery, store, isOverlayDismissed]);

  useEffect(() => {
    if (!current) return;
    setSelectedOptionId(current.selectedOptionId);
    setFreeform(current.freeformAnswer ?? "");
  }, [current?.id]);

  const dismissOverlay = useCallback(
    (streamError?: string | null) => {
      overlayDismissedRef.current = true;
      setOverlayDismissed(true);
      store.setGenerationArchitectureId(null);
      if (streamError) {
        setGenError(streamError);
        generationStartedRef.current = false;
      } else {
        generationStartedRef.current = true;
      }
      if (generatingFromQuery && sessionId) {
        const next = new URL(window.location.href);
        next.searchParams.delete("generating");
        window.history.replaceState(null, "", next.pathname + next.search);
      }
    },
    [store, generatingFromQuery, sessionId],
  );

  const runAutoGeneration = useCallback(async () => {
    if (!sessionId || overlayDismissedRef.current) return;
    generationStartedRef.current = true;
    setGenError(null);
    setStartingGeneration(true);
    try {
      overlayDismissedRef.current = false;
      setOverlayDismissed(false);
      const result = await startGeneration(sessionId, { slowMode: slowGeneration });
      if (overlayDismissedRef.current) return;
      store.setGenerationArchitectureId(result.architectureId);
      if (session) {
        store.hydrateSession(
          {
            ...session,
            architectureId: result.architectureId,
            linkedArchitectureStatus: "generating",
          },
          null,
        );
      }
    } catch (e) {
      if (overlayDismissedRef.current) return;
      generationStartedRef.current = false;
      store.setGenerationArchitectureId(null);
      setGenError(e instanceof ApiClientError ? e.message : "Failed to start generation");
    } finally {
      setStartingGeneration(false);
    }
  }, [sessionId, store, slowGeneration]);

  useEffect(() => {
    if (
      shouldAutoStartGeneration({
        sessionComplete: store.sessionComplete,
        linkedArchitectureStatus: session?.linkedArchitectureStatus,
        generationArchitectureId: store.generationArchitectureId,
        generationStarted: generationStartedRef.current,
      })
    ) {
      void runAutoGeneration();
    }
  }, [
    store.sessionComplete,
    session?.linkedArchitectureStatus,
    store.generationArchitectureId,
    runAutoGeneration,
  ]);

  const handleSelectOption = useCallback(
    (optionId: string) => {
      if (!current || loading || freeformActive) return;
      if (isEditing) {
        setSelectedOptionId(optionId);
        return;
      }
      void selectAndSubmitAnswer(current.id, optionId);
    },
    [current, freeformActive, isEditing, loading, selectAndSubmitAnswer],
  );

  const handleFreeformSubmit = useCallback(() => {
    if (!current || !isFreeformSubmitEnabled(freeform, loading, isEditing)) return;
    void submitFreeformAnswer(current.id, freeform).then(() => setFreeform(""));
  }, [current, freeform, isEditing, loading, submitFreeformAnswer]);

  const handleSaveEdit = useCallback(async () => {
    if (!current || !selectedOptionId) return;
    await editAnswer(current.id, {
      selectedOptionId,
      freeformAnswer: freeform.trim() || undefined,
    });
    setSelectedOptionId(null);
    setFreeform("");
  }, [current, selectedOptionId, freeform, editAnswer]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!current || current.status !== "pending" || loading || freeformActive) return;
      if (!["1", "2", "3", "4"].includes(e.key)) return;

      const opt = current.options.find((o) => o.keyboardHint === Number(e.key));
      if (!opt) return;

      e.preventDefault();
      if (isEditing) {
        setSelectedOptionId(opt.id);
        return;
      }
      void selectAndSubmitAnswer(current.id, opt.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, freeformActive, isEditing, loading, selectAndSubmitAnswer]);

  useEffect(() => {
    if (!isEditing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && selectedOptionId && !loading) {
        e.preventDefault();
        void handleSaveEdit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditing, selectedOptionId, loading, handleSaveEdit]);

  const handleSkip = async () => {
    if (!current) return;
    await skip(current.id);
    setSelectedOptionId(null);
    setFreeform("");
  };

  if (!sessionId) {
    return <p className="p-8 text-text-muted">Missing session.</p>;
  }

  const optionsDisabled = loading || (freeformActive && !isEditing);
  const showQuestions = current && (current.status === "pending" || isEditing);
  const showPreparingBanner = startingGeneration && !overlayArchitectureId;
  const showCompleteMessage =
    store.sessionComplete && !overlayArchitectureId && !genError && !startingGeneration;

  return (
    <div className="min-h-screen bg-bg-base px-6 py-10" data-testid="interrogation-page">
      {startingGeneration && !overlayArchitectureId ? <GenerationPendingOverlay /> : null}
      {overlayArchitectureId ? (
        <GenerationOverlay
          architectureId={overlayArchitectureId}
          onDismiss={(err) => dismissOverlay(err)}
          onRetry={() => {
            overlayDismissedRef.current = false;
            setOverlayDismissed(false);
            store.setGenerationArchitectureId(null);
            generationStartedRef.current = false;
            void runAutoGeneration();
          }}
          onError={(msg) => setGenError(msg)}
        />
      ) : null}

      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold">Architecture interrogation</h1>
          <p className="mt-1 text-sm text-text-muted line-clamp-2">{session?.initialPrompt}</p>
          {importContext ? (
            <div className="mt-2">
              <ImportContextBadge context={importContext} />
            </div>
          ) : null}
        </header>

        {editNotice ? (
          <p
            className="mb-4 rounded-lg border border-status-green/30 bg-status-green/10 px-3 py-2 text-sm text-status-green"
            data-testid="edit-success-toast"
            role="status"
          >
            {editNotice}
          </p>
        ) : null}

        <div className="mb-6 grid gap-3">
          <ProgressBar label="Context gathering" value={session?.contextGatheringProgress ?? 0} />
          <ProgressBar
            label="Governance coverage"
            value={session?.governanceCoverageProgress ?? 0}
            color="violet"
          />
        </div>

        <PreparingArchitectureBanner active={showPreparingBanner} />

        {answered.length > 0 ? (
          <section className="mb-8 space-y-2" data-testid="answered-questions">
            {answered.map((q) => (
              <AnsweredRow
                key={q.id}
                question={q}
                onEdit={(id) => store.setEditingQuestionId(id)}
              />
            ))}
          </section>
        ) : null}

        {showQuestions ? (
          <section className="animate-fade-in" data-testid="current-question">
            <KeyboardLegend show={current.index === 0 && !isEditing} />
            {isEditing ? (
              <p className="mb-2 text-xs text-brand-violet">
                Editing answer — choose an option, then Save edit
              </p>
            ) : null}
            <QuestionContext category={current.category} />
            <h2 className="mb-4 text-lg font-medium text-text-secondary">{current.questionText}</h2>
            <div
              className={cn(
                "grid gap-3 sm:grid-cols-2",
                optionsDisabled && "pointer-events-none opacity-60",
              )}
              data-testid="option-grid"
            >
              {current.options.map((opt) => (
                <OptionCard
                  key={opt.id}
                  option={opt}
                  selected={selectedOptionId === opt.id}
                  disabled={optionsDisabled}
                  onSelect={() => handleSelectOption(opt.id)}
                />
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-border-muted bg-bg-panel px-3 py-2 text-sm text-text-primary placeholder:text-text-ghost focus:outline-none focus:ring-1 focus:ring-brand-indigo/40 disabled:opacity-60"
                placeholder="Or type a custom answer…"
                value={freeform}
                disabled={loading && !isEditing}
                data-testid="freeform-input"
                onChange={(e) => setFreeform(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleFreeformSubmit();
                  }
                }}
              />
              <Button
                data-testid="freeform-submit-btn"
                disabled={!isFreeformSubmitEnabled(freeform, loading, isEditing)}
                loading={loading && freeformActive}
                onClick={() => handleFreeformSubmit()}
              >
                Submit
              </Button>
            </div>
            {freeformActive ? (
              <p className="mt-1 text-[11px] text-text-ghost">
                Options disabled while typing — Submit or clear text
              </p>
            ) : null}
            <LockedPreview />
          </section>
        ) : showCompleteMessage ? (
          <p className="text-text-muted" data-testid="interrogation-preparing">
            All questions answered — preparing your architecture…
          </p>
        ) : null}

        {error || genError ? (
          <div className="mt-4" data-testid="interrogation-error" role="alert">
            <p className="text-sm text-status-red">{error ?? genError}</p>
            {genError ? (
              <Button
                variant="secondary"
                className="mt-2"
                data-testid="generation-start-retry"
                onClick={() => void runAutoGeneration()}
              >
                Retry generation
              </Button>
            ) : null}
          </div>
        ) : null}

        {showQuestions ? (
          <footer className="mt-10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                data-testid="skip-question-btn"
                onClick={() => void handleSkip()}
                disabled={loading || isEditing}
              >
                Skip for now
              </Button>
              {current ? (
                <span className="text-[11px] text-status-amber">
                  Skip counts toward step {INTERROGATION.maxQuestions} — reduces confidence by ~
                  {current.confidenceImpact}%
                </span>
              ) : null}
            </div>

            <StepDots total={INTERROGATION.maxQuestions} current={session?.questions.length ?? 1} />

            <div className="flex flex-col items-end gap-1">
              {isEditing ? (
                <Button
                  data-testid="save-edit-btn"
                  onClick={() => void handleSaveEdit()}
                  loading={loading}
                  disabled={!selectedOptionId}
                >
                  Save edit
                </Button>
              ) : (
                <p className="text-[11px] text-text-muted" data-testid="auto-advance-hint">
                  {freeformActive ? "Press Submit or Enter" : "Select an option to continue"}
                </p>
              )}
              <div className="flex items-center gap-2 text-[11px] text-text-ghost">
                {store.lastAutosavedAt ? (
                  <span className="text-status-green" data-testid="autosaved-badge">
                    ✓ Autosaved
                  </span>
                ) : null}
                <span>
                  Step {Math.min(session?.questions.length ?? 1, INTERROGATION.maxQuestions)} of{" "}
                  {INTERROGATION.maxQuestions}
                </span>
                {isEditing ? <KbdHint keys={["↵"]} /> : null}
              </div>
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  color = "green",
}: {
  label: string;
  value: number;
  color?: "green" | "violet";
}): JSX.Element {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-text-dim">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-elevated">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            color === "violet" ? "bg-brand-violet" : "bg-status-green",
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function StepDots({ total, current }: { total: number; current: number }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 w-2 rounded-full",
              i < current - 1
                ? "bg-status-green"
                : i === current - 1
                  ? "bg-brand-violet ring-2 ring-brand-violet/30"
                  : "bg-border-muted",
            )}
          />
        ))}
      </div>
      <span className="text-[11px] text-text-ghost">
        {current} / {total}
      </span>
    </div>
  );
}
