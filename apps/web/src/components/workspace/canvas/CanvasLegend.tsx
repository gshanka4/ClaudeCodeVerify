export function CanvasLegend(): JSX.Element {
  return (
    <div
      className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-lg border border-border-muted bg-bg-panel/90 px-3 py-2 text-[10px] text-text-muted shadow-sm backdrop-blur-sm"
      data-testid="canvas-legend"
    >
      <p className="mb-1.5 font-medium text-text-secondary">Verification</p>
      <ul className="mb-2 space-y-1">
        <li className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-status-green" />
          Verified
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-status-amber" />
          Unverified
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-status-red" />
          Conflict
        </li>
      </ul>
      <p className="mb-1.5 font-medium text-text-secondary">Confidence</p>
      <ul className="space-y-1">
        <li className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-status-green" />
          High (≥80%)
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-status-amber" />
          Partial (50–79%)
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-status-red" />
          Critical issue
        </li>
      </ul>
      <p className="mb-1.5 mt-2 font-medium text-text-secondary">Connections</p>
      <ul className="space-y-1">
        <li className="flex items-center gap-2">
          <span className="h-0.5 w-4 bg-status-green" />
          Sync
        </li>
        <li className="flex items-center gap-2">
          <span className="h-0.5 w-4 border-t border-dashed border-brand-violet" />
          Async
        </li>
        <li className="flex items-center gap-2">
          <span className="h-0.5 w-4 bg-status-amber" />
          Event
        </li>
      </ul>
    </div>
  );
}
