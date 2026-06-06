import { INTERROGATION } from "@architectai/config";
import { useAuth, useClerk } from "@clerk/clerk-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LandingProgressSheet,
  type LandingProgressStep,
} from "@/components/landing/LandingProgressSheet";
import { ApiClientError, startInterrogation } from "@/lib/api";
import { useSessionStore } from "@/stores/useSessionStore";
import { LandingHero } from "./LandingHero";

export function LandingPageClerk(): JSX.Element {
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState<LandingProgressStep | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  const store = useSessionStore();

  const trimmed = prompt.trim();
  const valid = trimmed.length >= INTERROGATION.minPromptChars;

  useEffect(() => {
    const state = location.state as { needsAuth?: boolean } | null;
    if (state?.needsAuth && !isSignedIn) void clerk.openSignIn();
  }, [location.state, isSignedIn, clerk]);

  const runGenerate = useCallback(async () => {
    if (!valid) {
      setError(
        `Please describe your requirements (minimum ${INTERROGATION.minPromptChars} characters)`,
      );
      return;
    }
    setLoading(true);
    setProgressStep("session");
    const started = Date.now();
    try {
      setProgressStep("first-question");
      const result = await startInterrogation({ prompt: trimmed, importType: "text" });
      setProgressStep("navigate");
      const elapsed = Date.now() - started;
      if (elapsed < 400) await new Promise((r) => setTimeout(r, 400 - elapsed));
      store.setFromStart(
        result.sessionId,
        {
          id: result.sessionId,
          organizationId: "",
          userId: "",
          architectureId: null,
          initialPrompt: trimmed,
          status: "active",
          contextGatheringProgress: 0,
          governanceCoverageProgress: 0,
          questions: [result.firstQuestion],
          currentQuestionIndex: 0,
          createdAt: new Date(),
          completedAt: null,
        },
        result.firstQuestion,
      );
      navigate(`/interrogate/${result.sessionId}`);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to start");
    } finally {
      setLoading(false);
      setProgressStep(null);
    }
  }, [valid, trimmed, navigate, store]);

  const onGenerate = () => {
    if (!isSignedIn) {
      void clerk.openSignIn({ redirectUrl: window.location.href });
      return;
    }
    void runGenerate();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onGenerate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <LandingHero
      prompt={prompt}
      setPrompt={setPrompt}
      error={error}
      valid={valid}
      loading={loading}
      progressSheet={progressStep ? <LandingProgressSheet activeStep={progressStep} /> : null}
      onGenerate={onGenerate}
      headerExtra={null}
    />
  );
}
