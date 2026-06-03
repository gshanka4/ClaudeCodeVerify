import type { InterrogationSessionSummary } from "@architectai/shared";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";

interface Props {
  session: InterrogationSessionSummary;
}

export function ResumeSessionCard({ session }: Props): JSX.Element {
  const navigate = useNavigate();
  const isComplete = session.status === "complete";
  const label = isComplete ? "View architecture" : "Continue interrogation";
  const target = isComplete
    ? session.architectureId
      ? `/workspace/${session.architectureId}`
      : `/interrogate/${session.sessionId}`
    : `/interrogate/${session.sessionId}`;

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-border-muted bg-bg-panel p-4"
      data-testid={`resume-session-${session.sessionId}`}
    >
      <p className="line-clamp-2 text-sm text-text-secondary">{session.initialPrompt}</p>
      <p className="text-xs text-text-dim">
        {session.answeredCount} / {session.maxQuestions} questions
        {isComplete ? " · complete" : " · in progress"}
      </p>
      <Button
        variant="secondary"
        data-testid={isComplete ? "resume-view-architecture" : "resume-continue"}
        onClick={() => navigate(target)}
      >
        {label}
      </Button>
    </article>
  );
}
