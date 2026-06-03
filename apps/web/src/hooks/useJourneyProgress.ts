import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useSessionStore } from "@/stores/useSessionStore";

export type JourneyStepId =
  | "describe"
  | "interrogate"
  | "generate"
  | "verify-deterministic"
  | "verify-probabilistic"
  | "explore"
  | "lineage"
  | "lock"
  | "export"
  | "govern";

export type JourneyStepState = "upcoming" | "active" | "complete";

export interface JourneyStep {
  id: JourneyStepId;
  label: string;
  state: JourneyStepState;
}

export function useJourneyProgress(): { steps: JourneyStep[]; hideOnLanding: boolean } {
  const location = useLocation();
  const params = useParams();
  const sessionComplete = useSessionStore((s) => s.sessionComplete);
  const generationArchitectureId = useSessionStore((s) => s.generationArchitectureId);

  return useMemo(() => {
    const path = location.pathname;
    const hideOnLanding = path === "/";

    let active: JourneyStepId = "describe";
    if (path.startsWith("/interrogate")) active = sessionComplete ? "generate" : "interrogate";
    if (path.startsWith("/generate")) active = "generate";
    if (path.startsWith("/workspace")) active = "explore";
    if (path.startsWith("/export")) active = "export";
    if (path.startsWith("/dashboard")) active = "explore";

    const genStarted = Boolean(generationArchitectureId || params.architectureId);
    const order: JourneyStepId[] = [
      "describe",
      "interrogate",
      "generate",
      "verify-deterministic",
      "verify-probabilistic",
      "explore",
      "lineage",
      "lock",
      "export",
      "govern",
    ];
    const activeIdx = order.indexOf(active);

    const steps: JourneyStep[] = [
      { id: "describe", label: "Describe requirements", state: "upcoming" },
      { id: "interrogate", label: "Interrogate (≤7 Qs)", state: "upcoming" },
      { id: "generate", label: "Generate architecture", state: "upcoming" },
      { id: "verify-deterministic", label: "Verify — deterministic", state: "upcoming" },
      { id: "verify-probabilistic", label: "Verify — probabilistic", state: "upcoming" },
      { id: "explore", label: "Workspace & verdicts", state: "upcoming" },
      { id: "lineage", label: "Decision lineage graph", state: "upcoming" },
      { id: "lock", label: "Lock baseline", state: "upcoming" },
      { id: "export", label: "Export to repo", state: "upcoming" },
      { id: "govern", label: "Agent drift govern", state: "upcoming" },
    ];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      if (i < activeIdx) step.state = "complete";
      else if (step.id === active) step.state = "active";
      else step.state = "upcoming";
    }

    if (path === "/" && !sessionComplete) {
      steps[0]!.state = "active";
    }
    if (sessionComplete && path.startsWith("/interrogate") && !generationArchitectureId) {
      steps[1]!.state = "complete";
      steps[2]!.state = "active";
    }
    if (genStarted && (path.startsWith("/generate") || path.includes("generating"))) {
      steps[2]!.state = "active";
      steps[3]!.state = "upcoming";
    }
    if (path.startsWith("/workspace")) {
      for (let i = 0; i <= 5; i++) steps[i]!.state = "complete";
      steps[6]!.state = "active";
    }

    return { steps, hideOnLanding };
  }, [location.pathname, sessionComplete, generationArchitectureId, params.architectureId]);
}
