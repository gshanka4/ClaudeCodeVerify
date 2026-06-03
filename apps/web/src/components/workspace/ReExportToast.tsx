import { useEffect } from "react";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

const AUTO_DISMISS_MS = 5000;

export function ReExportToast(): JSX.Element | null {
  const message = useWorkspaceStore((s) => s.reExportMessage);
  const setReExportMessage = useWorkspaceStore((s) => s.setReExportMessage);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setReExportMessage(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [message, setReExportMessage]);

  if (!message) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-xl border border-brand-violet/40 bg-bg-panel px-4 py-3 text-sm text-text-primary shadow-lg"
      data-testid="re-export-toast"
      role="status"
    >
      {message}
    </div>
  );
}
