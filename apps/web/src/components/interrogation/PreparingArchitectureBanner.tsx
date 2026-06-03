import { useEffect, useState } from "react";

const MESSAGES = [
  "Analyzing your answers…",
  "Building governed service blueprint…",
  "Connecting decision lineage…",
  "Preparing verification pass…",
];

interface Props {
  active: boolean;
}

export function PreparingArchitectureBanner({ active }: Props): JSX.Element | null {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % MESSAGES.length), 2200);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="mb-6 rounded-xl border border-brand-violet/30 bg-brand-violet/10 px-4 py-4"
      data-testid="preparing-architecture-banner"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-medium text-text-primary">Preparing your architecture</p>
      <p className="mt-1 text-xs text-text-muted">{MESSAGES[msgIdx]}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-elevated">
        <div
          className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-brand-indigo to-brand-violet"
          data-testid="preparing-architecture-bar"
        />
      </div>
      <p className="mt-2 text-[11px] text-text-dim">
        Live models typically take 20–40s. After verification you can install the baseline in your
        repo for Claude Code.
      </p>
    </div>
  );
}
