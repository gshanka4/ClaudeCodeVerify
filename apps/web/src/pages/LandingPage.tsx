import { INTERROGATION } from "@architectai/config";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DevSignInModal } from "@/components/auth/DevSignInModal";
import { getDevClerkId, hasDevAuthToken } from "@/lib/auth-session";
import { Button } from "@/components/ui/Button";
import { ResumeSessionCard } from "@/components/dashboard/ResumeSessionCard";
import type { InterrogationSessionSummary } from "@architectai/shared";
import { ApiClientError, listArchitectures, listInterrogationSessions, startInterrogation } from "@/lib/api";
import { parseImportContext, storeImportContext } from "@/lib/import-context";
import { useSessionStore } from "@/stores/useSessionStore";
import {
  LandingProgressSheet,
  type LandingProgressStep,
} from "@/components/landing/LandingProgressSheet";
import { LandingHero } from "./LandingHero";
import { LandingPageClerk } from "./LandingPageClerk";

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

export default function LandingPage(): JSX.Element {
  if (clerkKey) return <LandingPageClerk />;
  return <LandingPageDev />;
}

function LandingPageDev(): JSX.Element {
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState<LandingProgressStep | null>(null);
  const [devModal, setDevModal] = useState(false);
  const [activeSessions, setActiveSessions] = useState<InterrogationSessionSummary[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const store = useSessionStore();
  const needsAuth = Boolean((location.state as { needsAuth?: boolean } | null)?.needsAuth);
  const trimmed = prompt.trim();
  const valid = trimmed.length >= INTERROGATION.minPromptChars;

  const runGenerate = useCallback(async () => {
    if (!valid) {
      setError(`Please describe your requirements (minimum ${INTERROGATION.minPromptChars} characters)`);
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
    if (!hasDevAuthToken()) {
      setProgressStep("auth");
      setDevModal(true);
      return;
    }
    void runGenerate();
  };

  useEffect(() => {
    const clerkId = getDevClerkId();
    if (!clerkId) return;
    void Promise.all([
      listInterrogationSessions({ status: "active", limit: 3 }),
      listArchitectures(),
    ])
      .then(([sessions, archs]) => {
        setActiveSessions(sessions);
        if (archs.total > 0 && sessions.length === 0) navigate("/dashboard", { replace: true });
      })
      .catch(() => setActiveSessions([]));
  }, [navigate]);

  return (
    <>
      <LandingHero
        prompt={prompt}
        setPrompt={setPrompt}
        error={
          error ??
          (needsAuth && !hasDevAuthToken() ? "Sign in to continue" : null)
        }
        valid={valid}
        loading={loading}
        progressSheet={
          progressStep ? <LandingProgressSheet activeStep={progressStep} /> : null
        }
        onGenerate={onGenerate}
        onImportPaste={(text) => {
          const ctx = parseImportContext(text);
          if (ctx) storeImportContext(ctx);
        }}
        resumeSection={
          activeSessions.length > 0 ? (
            <section data-testid="landing-resume-sessions">
              <h2 className="mb-3 text-sm font-medium text-text-secondary">Continue where you left off</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {activeSessions.map((s) => (
                  <ResumeSessionCard key={s.sessionId} session={s} />
                ))}
              </div>
            </section>
          ) : null
        }
        headerExtra={
          <Button variant="ghost" onClick={() => setDevModal(true)}>
            Dev sign-in
          </Button>
        }
      />
      <DevSignInModal
        open={devModal}
        onClose={() => setDevModal(false)}
        onSignedIn={() => {
          setProgressStep("session");
          void runGenerate();
        }}
      />
    </>
  );
}
