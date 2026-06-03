import { Lock } from "lucide-react";

const PREVIEW_PLACEHOLDERS = [
  "Upcoming: security & trust boundaries",
  "Upcoming: compliance & data residency",
] as const;

/** PRD Screen 2 — "Coming next" locked previews (orientation only). */
export function LockedPreview(): JSX.Element {
  return (
    <section className="mt-6 space-y-2" aria-label="Coming next (locked)">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-ghost">Coming next</p>
      {PREVIEW_PLACEHOLDERS.map((label) => (
        <div
          key={label}
          className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated/40 px-3 py-2 opacity-60"
        >
          <Lock size={14} className="shrink-0 text-text-ghost" aria-hidden />
          <span className="text-sm text-text-dim">{label}</span>
          <span className="ml-auto text-[10px] text-text-ghost">(Locked)</span>
        </div>
      ))}
    </section>
  );
}
