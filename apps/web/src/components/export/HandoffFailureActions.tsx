import { useState } from "react";
import { VSCODE_EXTENSION_INSTALL_URI } from "@architectai/shared";
import { Button } from "@/components/ui/Button";
import { extensionVsixUrl } from "@/lib/handoff-failure";

interface Props {
  deepLink?: string;
  onCopyLink?: () => void | Promise<void>;
}

export function HandoffFailureActions({ deepLink, onCopyLink }: Props): JSX.Element {
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [showManualCopy, setShowManualCopy] = useState(false);
  const [vsixError, setVsixError] = useState<string | null>(null);

  const handleCopy = async () => {
    if (!deepLink) return;
    setShowManualCopy(false);
    try {
      if (onCopyLink) {
        await onCopyLink();
      } else {
        await navigator.clipboard.writeText(deepLink);
      }
      setCopyHint("Link copied.");
    } catch {
      setCopyHint("Clipboard blocked — copy from the field below.");
      setShowManualCopy(true);
    }
  };

  const handleVsixDownload = async () => {
    setVsixError(null);
    const url = extensionVsixUrl();
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (!res.ok) {
        setVsixError(`VSIX not available (${res.status}). Use Install extension or Copy link.`);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setVsixError("Could not download VSIX. Use Install extension or Copy link.");
    }
  };

  return (
    <div className="mt-4 space-y-3" data-testid="handoff-failure-actions">
      <p className="text-xs text-text-muted">
        If the legacy IDE handoff did not open, try these recovery steps:
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={VSCODE_EXTENSION_INSTALL_URI}
          className="inline-flex items-center rounded-lg border border-border-muted px-3 py-2 text-sm text-brand-violet hover:bg-bg-elevated"
          data-testid="handoff-install-extension"
        >
          Install extension
        </a>
        <Button
          variant="secondary"
          data-testid="handoff-copy-link"
          disabled={!deepLink}
          onClick={() => void handleCopy()}
        >
          Copy link
        </Button>
        <Button
          variant="ghost"
          data-testid="handoff-download-vsix"
          onClick={() => void handleVsixDownload()}
        >
          Download VSIX
        </Button>
      </div>
      {copyHint ? (
        <p className="text-xs text-status-amber" data-testid="handoff-copy-hint">
          {copyHint}
        </p>
      ) : null}
      {vsixError ? (
        <p className="text-xs text-status-red" data-testid="handoff-vsix-error">
          {vsixError}
        </p>
      ) : null}
      {showManualCopy && deepLink ? (
        <textarea
          readOnly
          className="h-20 w-full rounded-lg border border-border-muted bg-bg-elevated px-2 py-1 font-mono text-xs text-text-primary"
          data-testid="handoff-copy-fallback"
          value={deepLink}
          onFocus={(e) => e.target.select()}
        />
      ) : null}
    </div>
  );
}
