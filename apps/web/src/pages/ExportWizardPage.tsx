import type { MvpExportFormat } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ExportEducationModal } from "@/components/export/ExportEducationModal";
import { HandoffFailureActions } from "@/components/export/HandoffFailureActions";
import { hasSeenExportEducation } from "@/lib/onboarding-flags";
import { Button } from "@/components/ui/Button";
import {
  exportArchitecture,
  getArchitectureDetail,
  lockArchitecture,
  registerCursorWorkspace,
  requestExportIdeHandoff,
  type ArchitectureDetailResponse,
} from "@/lib/api";
import {
  buildIdeDeepLink,
  ideLabel,
  launchIdeHandoff,
  parseIdeQueryParam,
  type IdeTarget,
} from "@/lib/ide";

const FORMATS: { id: MvpExportFormat; label: string }[] = [
  { id: "claude-code-bundle", label: "Claude Code bundle" },
  { id: "cursor-config", label: "Legacy IDE bundle (Cursor / VS Code)" },
  { id: "openapi", label: "OpenAPI" },
  { id: "adr-markdown", label: "ADR Markdown" },
];

export default function ExportWizardPage(): JSX.Element {
  const { architectureId } = useParams<{ architectureId: string }>();
  const [searchParams] = useSearchParams();
  const ide: IdeTarget = parseIdeQueryParam(searchParams.toString());
  const isClaudeCodeQuick = ide === "claude-code";
  const isLegacyQuickHandoff = ide === "cursor" || ide === "antigravity";

  const [step, setStep] = useState(1);
  const [detail, setDetail] = useState<ArchitectureDetailResponse | null>(null);
  const [workspacePath, setWorkspacePath] = useState("");
  const [format, setFormat] = useState<MvpExportFormat>(
    ide === "claude-code" ? "claude-code-bundle" : "cursor-config",
  );
  const [token, setToken] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<string[]>([]);
  const [verificationStamp, setVerificationStamp] = useState<{
    verificationRunId?: string;
    trustGrade?: number;
  } | null>(null);
  const [deepLink, setDeepLink] = useState("");
  const [claudeCodeFiles, setClaudeCodeFiles] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [exportEducationOpen, setExportEducationOpen] = useState(
    () => !hasSeenExportEducation(),
  );
  const lockAttempted = useRef(false);
  const quickHandoffAttempted = useRef(false);

  useEffect(() => {
    if (!architectureId) return;
    getArchitectureDetail(architectureId).then(setDetail).catch((e: Error) => setError(e.message));
  }, [architectureId]);

  useEffect(() => {
    if (!architectureId || lockAttempted.current) return;
    lockAttempted.current = true;
    setLocking(true);
    setLockError(null);
    lockArchitecture(architectureId)
      .catch((e: Error) => setLockError(e.message))
      .finally(() => setLocking(false));
  }, [architectureId]);

  useEffect(() => {
    if (
      !architectureId ||
      (!isClaudeCodeQuick && !isLegacyQuickHandoff) ||
      lockError ||
      locking ||
      quickHandoffAttempted.current
    ) {
      return;
    }
    quickHandoffAttempted.current = true;
    setBusy(true);
    setError(null);
    requestExportIdeHandoff(architectureId, ide)
      .then((handoff) => {
        setWorkspaceId(handoff.workspaceId);
        if (handoff.claudeCodeFiles) {
          setClaudeCodeFiles(handoff.claudeCodeFiles);
          setCopyHint("Download the bundle and merge CLAUDE.md into your repo.");
        } else {
          setDeepLink(handoff.deepLink);
          setCopyHint("Copy the legacy handoff link and open your IDE to load governed artifacts.");
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }, [architectureId, ide, isClaudeCodeQuick, isLegacyQuickHandoff, lockError, locking]);

  const runRegister = async () => {
    if (!architectureId || !workspacePath.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await registerCursorWorkspace({
        architectureId,
        workspacePath: workspacePath.trim(),
        ideTarget: ide,
      });
      setToken(reg.apiToken);
      setWorkspaceId(reg.workspaceId);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const runExport = async () => {
    if (!architectureId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await exportArchitecture(architectureId, format, ide);
      if (format === "claude-code-bundle" || format === "cursor-config") {
        const bundle = JSON.parse(res.content) as Record<string, unknown>;
        setArtifacts(Object.keys(bundle));
        const manifest = bundle[".architectai/manifest.json"] as
          | { verificationRunId?: string; trustGrade?: number }
          | undefined;
        if (manifest?.verificationRunId) {
          setVerificationStamp({
            verificationRunId: manifest.verificationRunId,
            trustGrade: manifest.trustGrade,
          });
        } else {
          setVerificationStamp(null);
        }
      } else {
        setArtifacts([res.filename]);
      }
      if (token) {
        setDeepLink(buildIdeDeepLink(ide, token, architectureId, workspaceId ?? undefined));
      }
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const onCopyLink = async () => {
    if (!deepLink) return;
    try {
      await navigator.clipboard.writeText(deepLink);
      setCopyHint("Link copied to clipboard.");
    } catch {
      setCopyHint("Could not copy — select the link and copy manually.");
    }
  };

  const onOpenIde = () => {
    if (!deepLink) return;
    const mode = launchIdeHandoff(deepLink, ide);
    if (mode === "copy-only") {
      void onCopyLink();
      setCopyHint("Copy the legacy link and open your IDE manually.");
    }
  };

  if (!architectureId) return <p className="p-8">Missing architecture id</p>;

  /** Pre-lock is best-effort; export/convert establishes baseline if needed. */
  const wizardBlocked = locking;

  if (isClaudeCodeQuick || isLegacyQuickHandoff) {
    return (
      <div className="min-h-screen bg-bg-base px-6 py-10" data-testid="export-wizard-page">
        <div
          className="mx-auto max-w-2xl"
          data-testid={isClaudeCodeQuick ? "export-claude-code-quick" : "export-cursor-quick"}
        >
          <Link to={`/workspace/${architectureId}`} className="text-sm text-brand-violet">
            ← Back to workspace
          </Link>
          <h1 className="mt-4 text-2xl font-semibold">
            {isClaudeCodeQuick ? "Claude Code setup" : `Connect ${ideLabel(ide)}`}
          </h1>
          <p className="text-sm text-text-muted">
            {detail?.name ?? "Loading…"}
            {isClaudeCodeQuick
              ? " — download the verified bundle into your repo."
              : " — copy the handoff link (no multi-step wizard)."}
          </p>
          {locking ? (
            <p className="mt-2 text-xs text-text-dim" data-testid="export-locking">
              Preparing export baseline…
            </p>
          ) : null}
          {lockError ? (
            <p className="mt-2 text-sm text-status-red" data-testid="export-lock-error">
              {lockError}
            </p>
          ) : null}
          {busy ? (
            <p className="mt-4 text-sm text-text-muted">
              {isClaudeCodeQuick ? "Generating Claude Code bundle…" : "Building handoff link…"}
            </p>
          ) : null}
          {error ? <p className="mt-4 text-sm text-status-red">{error}</p> : null}
          {copyHint ? (
            <p className="mt-2 text-sm text-status-amber" data-testid="export-copy-hint">
              {copyHint}
            </p>
          ) : null}
          {claudeCodeFiles ? (
            <ul
              className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-border-muted bg-bg-panel p-3 text-xs text-text-dim"
              data-testid="export-claude-code-files"
            >
              {Object.keys(claudeCodeFiles).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          {deepLink && !claudeCodeFiles ? (
            <>
              <a
                href={deepLink}
                data-testid="export-deep-link"
                className="mt-4 block break-all rounded-lg border border-brand-violet/30 bg-brand-violet/10 px-3 py-2 text-sm text-brand-violet"
              >
                {deepLink}
              </a>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button data-testid="export-copy-link-btn" onClick={() => void onCopyLink()}>
                  Copy link
                </Button>
                <Button variant="secondary" data-testid="export-open-ide-btn" onClick={onOpenIde}>
                  Open in {ideLabel(ide)}
                </Button>
              </div>
              <HandoffFailureActions deepLink={deepLink} onCopyLink={() => void onCopyLink()} />
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base px-6 py-10" data-testid="export-wizard-page">
      <ExportEducationModal
        open={exportEducationOpen}
        onContinue={() => setExportEducationOpen(false)}
        onClose={() => setExportEducationOpen(false)}
      />
      <div className="mx-auto max-w-2xl">
        <Link to={`/workspace/${architectureId}`} className="text-sm text-brand-violet">
          ← Back to workspace
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Export to repo</h1>
        <p className="text-sm text-text-muted">
          {detail?.name ?? "Loading…"} · Target:{" "}
          <span data-testid="export-ide-target">{ideLabel(ide)}</span>
        </p>

        {locking ? (
          <p className="mt-2 text-xs text-text-dim" data-testid="export-locking">
            Preparing export baseline…
          </p>
        ) : null}
        {lockError ? (
          <p className="mt-2 text-sm text-status-red" data-testid="export-lock-error">
            {lockError}
          </p>
        ) : null}

        <ol className="mt-8 flex gap-2 text-xs text-text-dim" data-testid="export-steps">
          {["Workspace path", "Register", "Convert", "Legacy launch"].map((label, i) => (
            <li
              key={label}
              className={step === i + 1 ? "font-medium text-brand-violet" : ""}
              data-testid={`export-step-${i + 1}`}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>

        {error ? <p className="mt-4 text-sm text-status-red">{error}</p> : null}
        {copyHint ? (
          <p className="mt-2 text-sm text-status-amber" data-testid="export-copy-hint">
            {copyHint}
          </p>
        ) : null}

        {step === 1 ? (
          <div className="mt-6 space-y-4" data-testid="export-step-workspace">
            <label className="block text-sm">
              Local workspace path
              <input
                data-testid="workspace-path-input"
                className="mt-1 w-full rounded-lg border border-border-muted bg-bg-panel px-3 py-2"
                value={workspacePath}
                onChange={(e) => setWorkspacePath(e.target.value)}
                placeholder="/Users/you/projects/my-app"
                disabled={wizardBlocked}
              />
            </label>
            <div>
              <p className="mb-2 text-sm text-text-muted">Export format</p>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    data-testid={`format-${f.id}`}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      format === f.id
                        ? "border-brand-violet text-brand-violet"
                        : "border-border-muted text-text-muted"
                    }`}
                    onClick={() => setFormat(f.id)}
                    disabled={wizardBlocked}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <Button
              data-testid="export-next-1"
              disabled={!workspacePath.trim() || wizardBlocked}
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-6 space-y-4" data-testid="export-step-register">
            <p className="text-sm text-text-muted">
              Register workspace <code className="text-text-primary">{workspacePath}</code>
            </p>
            <Button
              data-testid="export-register-btn"
              loading={busy}
              disabled={wizardBlocked}
              onClick={() => void runRegister()}
            >
              Register workspace
            </Button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-6 space-y-4" data-testid="export-step-convert">
            <div
              className="rounded-lg border border-border-muted bg-bg-panel p-4 font-mono text-xs text-status-green"
              data-testid="export-terminal"
            >
              $ architectai export --format {format} --ide {ide}
              <br />
              Building .architectai artifacts…
            </div>
            <Button
              data-testid="export-convert-btn"
              loading={busy}
              disabled={wizardBlocked}
              onClick={() => void runExport()}
            >
              Generate artifacts
            </Button>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="mt-6 space-y-4" data-testid="export-step-launch">
            <div className="grid gap-2" data-testid="export-artifacts">
              {artifacts.map((a) => (
                <div
                  key={a}
                  className="rounded-lg border border-border-muted bg-bg-panel px-3 py-2 text-sm"
                >
                  {a}
                </div>
              ))}
            </div>
            {verificationStamp?.verificationRunId ? (
              <div
                className="rounded-lg border border-brand-violet/30 bg-brand-violet/10 px-3 py-2 text-sm"
                data-testid="export-verification-stamp"
              >
                Verified baseline · Trust Grade {verificationStamp.trustGrade ?? "—"}
                <span className="mt-1 block font-mono text-[10px] text-text-dim">
                  {verificationStamp.verificationRunId}
                </span>
              </div>
            ) : null}
            <a
              href={deepLink}
              data-testid="export-deep-link"
              className="block break-all rounded-lg border border-brand-violet/30 bg-brand-violet/10 px-3 py-2 text-sm text-brand-violet"
            >
              {deepLink}
            </a>
            <div className="flex flex-wrap gap-2">
              <Button data-testid="export-open-ide-btn" onClick={onOpenIde}>
                Open in {ideLabel(ide)}
              </Button>
              <Button variant="secondary" data-testid="export-copy-link-btn" onClick={() => void onCopyLink()}>
                Copy link
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
