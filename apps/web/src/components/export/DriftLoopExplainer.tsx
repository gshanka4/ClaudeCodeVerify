import { DRIFT_LOOP_STEPS } from "@/lib/export-artifacts-copy";

export function DriftLoopExplainer(): JSX.Element {
  return (
    <ol
      className="mt-2 list-decimal space-y-1.5 pl-4 text-xs text-text-muted"
      data-testid="drift-loop-explainer"
    >
      {DRIFT_LOOP_STEPS.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}
