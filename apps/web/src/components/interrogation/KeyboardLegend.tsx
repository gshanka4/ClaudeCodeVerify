import { useEffect, useState } from "react";
import { KbdHint } from "@/components/ui/KbdHint";

const STORAGE_KEY = "ux.legend.dismissed";

interface Props {
  show: boolean;
}

export function KeyboardLegend({ show }: Props): JSX.Element | null {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");

  useEffect(() => {
    if (!show) return;
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
  }, [show]);

  if (!show || dismissed) return null;

  return (
    <aside
      className="mb-6 rounded-xl border border-border-muted bg-bg-panel px-4 py-3 text-sm text-text-muted"
      data-testid="keyboard-legend"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="font-medium text-text-secondary">Keyboard shortcuts</p>
          <ul className="space-y-1 text-xs">
            <li className="flex items-center gap-2">
              <KbdHint keys={["1", "4"]} label="select an option" />
            </li>
            <li className="flex items-center gap-2">
              <KbdHint keys={["↵"]} label="submit freeform answer" />
            </li>
          </ul>
        </div>
        <button
          type="button"
          className="shrink-0 text-xs text-text-ghost hover:text-text-primary"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "1");
            setDismissed(true);
          }}
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}
