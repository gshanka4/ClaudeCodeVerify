import { GenerationExperience } from "@/components/generation/GenerationExperience";
import type { GenerationStreamState } from "@/hooks/useGenerationStream";

const pendingStream: GenerationStreamState = {
  events: [],
  nodes: [],
  governance: [],
  progress: null,
  complete: null,
  error: null,
  connected: false,
  reconnecting: false,
};

/** Full-screen progress UI while POST /api/generate/start is in flight. */
export function GenerationPendingOverlay(): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-bg-base/95 px-6 py-10 backdrop-blur-sm"
      data-testid="generation-pending-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generation-overlay-title"
    >
      <div className="max-h-full w-full max-w-4xl overflow-y-auto">
        <GenerationExperience stream={pendingStream} />
      </div>
    </div>
  );
}
