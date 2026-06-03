import type { ImportContext } from "@/lib/import-context";

interface Props {
  context: ImportContext;
}

export function ImportContextBadge({ context }: Props): JSX.Element {
  return (
    <span
      className="inline-flex items-center rounded-full border border-brand-indigo/30 bg-brand-indigo/10 px-2.5 py-0.5 text-[11px] text-brand-indigo"
      data-testid="import-context-badge"
      title={context.truncated ? "Large import was truncated for display" : undefined}
    >
      {context.label}
      {context.truncated ? " · truncated" : ""}
    </span>
  );
}
