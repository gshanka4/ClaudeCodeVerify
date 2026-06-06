import { useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { Button } from "@/components/ui/Button";
import { DEV_CLERK_STORAGE_KEY } from "@/lib/auth-session";

interface DevSignInModalProps {
  open: boolean;
  onClose: () => void;
  onSignedIn: () => void;
}

async function provisionDevUser(): Promise<string> {
  const res = await fetch(apiUrl("/__dev__/provision"), { method: "POST" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Provision failed (${res.status})`);
  }
  const body = (await res.json()) as { clerkId: string };
  return body.clerkId;
}

/**
 * Local-dev sign-in when Clerk keys are absent. One-click provision via the API
 * dev endpoint, or paste a clerkId manually.
 */
export function DevSignInModal({
  open,
  onClose,
  onSignedIn,
}: DevSignInModalProps): JSX.Element | null {
  const [clerkId, setClerkId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const finish = (id: string) => {
    sessionStorage.setItem(DEV_CLERK_STORAGE_KEY, id);
    onSignedIn();
    onClose();
  };

  const onQuickSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await provisionDevUser();
      finish(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not provision dev user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-border-muted bg-bg-panel p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text-primary">Sign in (dev)</h2>
        <p className="mt-2 text-sm text-text-muted">
          Clerk is not configured. Create a local test user or paste an existing{" "}
          <code className="text-text-secondary">clerkId</code>.
        </p>

        {error ? <p className="mt-3 text-sm text-status-red">{error}</p> : null}

        <Button
          className="mt-4 w-full"
          data-testid="dev-sign-in-quick"
          disabled={busy}
          onClick={() => void onQuickSignIn()}
        >
          {busy ? "Creating…" : "Create dev user & continue"}
        </Button>

        <p className="my-4 text-center text-xs text-text-dim">or paste clerkId</p>

        <input
          className="w-full rounded-lg border border-border-muted bg-bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-indigo/40"
          placeholder="clerk_…"
          value={clerkId}
          onChange={(e) => setClerkId(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            data-testid="dev-sign-in-continue"
            disabled={!clerkId.trim()}
            onClick={() => finish(clerkId.trim())}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
