import type { GenerationNodeEvent } from "@architectai/shared";

interface Props {
  nodes: GenerationNodeEvent[];
}

export function GenerationNodePreview({ nodes }: Props): JSX.Element {
  return (
    <section data-testid="generation-node-preview">
      <h3 className="mb-2 text-sm font-medium text-text-secondary">Live preview</h3>
      <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border-subtle bg-bg-panel p-2">
        {nodes.length === 0 ? (
          <li className="text-xs text-text-ghost">Waiting for services…</li>
        ) : (
          nodes.map((n) => (
            <li
              key={n.serviceId}
              data-testid="generation-node-preview-row"
              className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-bg-elevated"
            >
              <span className="font-medium text-text-primary">{n.name}</span>
              <span
                className="rounded bg-brand-indigo/15 px-1.5 py-0.5 text-[10px] capitalize text-brand-violet"
                data-testid="generation-node-layer-badge"
              >
                {n.layer}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
