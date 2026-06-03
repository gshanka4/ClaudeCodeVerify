import * as vscode from "vscode";
import type { CursorConfig, CursorWsMessage, DriftEvent } from "@architectai/shared";
import { ArchitectApiClient, ApiClientError } from "./lib/api-client";
import { filesFromCursorConfigExport } from "./lib/bundle-writer";
import { createDebouncer } from "./lib/debounce";
import { buildFallbackArchiveManifest } from "./lib/fallback";
import { parseConnectUri } from "./lib/deep-link";
import {
  getPendingConnectUri,
  isArchitectAiExtensionActive,
  pickOrCreateWorkspace,
  postConnectPanelMode,
  promptInstallExtension,
  setPendingConnectUri,
} from "./lib/workspace-onboarding";
import { shouldMonitorFile } from "./lib/paths";
import {
  createInitialState,
  criticalDriftCount,
  statusBarLabel,
  applyFixToContent,
  type ExtensionState,
} from "./lib/state";
import { loadStoredSession, MemorySecretStore, persistDismissed, persistSession } from "./lib/storage";
import { DriftWsClient } from "./lib/ws-client";
import { driftPanelHtml, normalPanelHtml, setupPanelHtml } from "./panels/html";

const DEBOUNCE_MS = 400;

const state: ExtensionState = createInitialState();
const store = new MemorySecretStore();
let api: ArchitectApiClient | null = null;
let wsClient: DriftWsClient | null = null;
let panel: vscode.WebviewPanel | undefined;
let statusItem: vscode.StatusBarItem | undefined;
const debouncer = createDebouncer(DEBOUNCE_MS);
const decorationType = vscode.window.createTextEditorDecorationType({
  gutterIconPath: undefined,
  backgroundColor: "rgba(239,68,68,0.15)",
  border: "1px solid rgba(239,68,68,0.4)",
});
let pendingHandoffSessionId: string | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const persisted = await loadStoredSession(store);
  state.token = persisted.token;
  state.workspaceId = persisted.workspaceId;
  state.config = persisted.config;
  state.dismissedDriftIds = persisted.dismissedDriftIds;
  if (state.config) {
    state.panelMode = "normal";
    bootApi();
    startWs();
  }

  context.subscriptions.push(
    vscode.window.registerUriHandler({ handleUri: (uri) => handleDeepLink(uri) }),
    vscode.commands.registerCommand("architectai.connect", () =>
      vscode.window.showInputBox({ prompt: "Paste deep-link URL" }).then((v) => {
        if (v) void handleDeepLink(vscode.Uri.parse(v));
      }),
    ),
    vscode.commands.registerCommand("architectai.downloadFallback", () => downloadFallback()),
    vscode.commands.registerCommand("architectai.openDrift", () => showDriftPanel()),
    vscode.workspace.onDidSaveTextDocument((doc) => onSave(doc)),
    decorationType,
  );

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.command = "architectai.openDrift";
  context.subscriptions.push(statusItem);
  updateStatusBar();

  if (state.panelMode === "setup" || !state.config) {
    showSetupPanel();
  } else {
    showNormalPanel();
  }

  const pendingUri = getPendingConnectUri();
  if (pendingUri) {
    setPendingConnectUri(null);
    void handleDeepLink(pendingUri);
  }
}

export function deactivate(): void {
  wsClient?.disconnect();
  debouncer.clear();
  panel?.dispose();
}

async function handleDeepLink(uri: vscode.Uri | string): Promise<void> {
  const uriString =
    typeof uri === "string"
      ? uri
      : `${uri.scheme}://${uri.authority}${uri.path}${uri.query}`;

  if (!isArchitectAiExtensionActive()) {
    setPendingConnectUri(uriString);
    await promptInstallExtension();
    return;
  }

  const parsed = parseConnectUri(
    typeof uri === "string"
      ? uri
      : { scheme: uri.scheme, authority: uri.authority, path: uri.path, query: uri.query },
  );
  if (!parsed) {
    void vscode.window.showErrorMessage("Invalid ArchitectAI connect link");
    return;
  }

  state.token = parsed.token;
  state.workspaceId = parsed.workspaceId ?? null;
  pendingHandoffSessionId = parsed.handoffSessionId;
  bootApi();

  try {
    if (!state.workspaceId) {
      throw new ApiClientError(400, "workspaceId required in connect link");
    }
    const config = await api!.pullConfig(state.workspaceId);
    state.config = config;
    state.token = config.apiToken;

    let bundleJson: string | null = null;
    try {
      const bundle = await api!.pullExportBundle(state.workspaceId);
      bundleJson = bundle.content;
      state.exportBundleJson = bundle.content;
    } catch (bundleErr) {
      state.exportBundleJson = null;
      const bundleMsg =
        bundleErr instanceof ApiClientError
          ? bundleErr.message
          : "Export bundle unavailable";
      void vscode.window.showWarningMessage(
        `ArchitectAI: ${bundleMsg} — use Initialize Workspace to write fallback files.`,
      );
    }

    await persistSession(store, {
      token: config.apiToken,
      workspaceId: state.workspaceId,
      config,
    });

    const picked = await pickOrCreateWorkspace();
    if (picked.kind === "cancelled") {
      const mode = postConnectPanelMode(bundleJson, false);
      state.panelMode = mode;
      showSetupPanel();
      void vscode.window.showInformationMessage(
        "ArchitectAI: choose a workspace folder to write governed artifacts.",
      );
      return;
    }
    await finalizeWorkspaceConnection(config, bundleJson, picked.fsPath);
  } catch (e) {
    const msg = e instanceof ApiClientError && e.needsReauth
      ? "Workspace token invalid — reconnect from the web app Export flow"
      : e instanceof Error
        ? e.message
        : "Config pull failed";
    void vscode.window.showErrorMessage(msg);
    await downloadFallback();
  }
}

async function finalizeWorkspaceConnection(
  config: CursorConfig,
  bundleJson: string | null,
  workspacePath: string,
): Promise<void> {
  if (!api || !state.workspaceId) return;
  await api.patchWorkspacePath(state.workspaceId, workspacePath);
  const mode = postConnectPanelMode(bundleJson, true);
  if (mode !== "normal" || !bundleJson) {
    state.panelMode = "setup";
    showSetupPanel();
    void vscode.window.showInformationMessage(
      `ArchitectAI: connected to ${config.architectureName} — initialize workspace to write artifacts.`,
    );
    return;
  }
  await writeBundleToWorkspace(config, bundleJson);
  state.panelMode = "normal";
  state.monitoringPaused = false;
  startWs();
  showNormalPanel();
  if (pendingHandoffSessionId) {
    try {
      await api.reportHandoffWorkspaceLinked(state.workspaceId, pendingHandoffSessionId);
    } catch {
      /* web poll fallback */
    }
    pendingHandoffSessionId = undefined;
  }
  void vscode.window.showInformationMessage(
    `ArchitectAI: ${config.architectureName} — artifacts synced to workspace`,
  );
}

function bootApi(): void {
  api = new ArchitectApiClient({
    getToken: () => state.token,
    getConfig: () => state.config,
  });
}

function startWs(): void {
  const cfg = state.config;
  if (!cfg) return;
  wsClient?.disconnect();
  wsClient = new DriftWsClient({
    url: cfg.wsEndpoint,
    onMessage: (msg: CursorWsMessage) => {
      if (msg.type === "drift.detected") {
        mergeDrift(msg.payload);
        showDriftPanel();
      }
      if (msg.type === "architecture.updated") {
        void refreshContracts();
      }
    },
    onDisconnect: () => wsClient?.scheduleReconnect(300),
  });
  wsClient.connect();
}

async function refreshContracts(): Promise<void> {
  if (!state.workspaceId || !api || !state.config) return;
  try {
    const next = await api.pullConfig(state.workspaceId);
    state.config = next;
    try {
      const bundle = await api.pullExportBundle(state.workspaceId);
      state.exportBundleJson = bundle.content;
    } catch {
      /* keep prior bundle if pull fails */
    }
    await writeBundleToWorkspace(next, state.exportBundleJson);
    void vscode.window.showInformationMessage("ArchitectAI: contracts updated after re-export");
  } catch {
    state.monitoringPaused = true;
    void vscode.window.showWarningMessage("ArchitectAI: monitoring paused — server unreachable");
  }
}

async function initializeWorkspace(): Promise<void> {
  const cfg = state.config;
  if (!cfg || !state.workspaceId || !api) return;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (root) {
    await api.patchWorkspacePath(state.workspaceId, root.fsPath);
  }
  await writeBundleToWorkspace(cfg, state.exportBundleJson);
  state.panelMode = "normal";
  state.monitoringPaused = false;
  startWs();
  showNormalPanel();
  if (pendingHandoffSessionId) {
    try {
      await api.reportHandoffWorkspaceLinked(state.workspaceId, pendingHandoffSessionId);
    } catch {
      /* ignore */
    }
    pendingHandoffSessionId = undefined;
  }
}

async function writeBundleToWorkspace(
  config: CursorConfig,
  exportJson: string | null,
): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) throw new Error("Open a workspace folder first");
  const content = exportJson ?? JSON.stringify({}, null, 2);
  const files = filesFromCursorConfigExport(content, config);
  for (const f of files) {
    const uri = vscode.Uri.joinPath(root, f.relativePath);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(f.content, "utf8"));
  }
}

function onSave(doc: vscode.TextDocument): void {
  const cfg = state.config;
  if (!cfg || state.monitoringPaused) return;
  const rel = vscode.workspace.asRelativePath(doc.uri);
  if (!shouldMonitorFile(rel, cfg.monitoredPaths, cfg.ignoredPaths)) return;

  debouncer.schedule(rel, () => void runDriftCheck(doc, rel));
}

async function runDriftCheck(doc: vscode.TextDocument, rel: string): Promise<void> {
  if (!api) return;
  try {
    const result = await api.checkDrift(rel, doc.getText());
    const drifts = result.drifts.filter((d) => !state.dismissedDriftIds.has(d.id));
    state.openDrifts = drifts;
    if (result.hasDrift && drifts.length > 0) {
      applyEditorDecorations(doc, drifts);
      showDriftPanel();
      void vscode.window.showWarningMessage(`ArchitectAI: drift detected in ${rel}`);
    } else {
      clearDecorations(doc);
      if (state.panelMode === "drift") showNormalPanel();
    }
    updateStatusBar();
  } catch (e) {
    state.monitoringPaused = true;
    const msg =
      e instanceof ApiClientError && e.needsReauth
        ? "ArchitectAI: token expired — reconnect from web export"
        : "ArchitectAI: monitoring paused — server unreachable";
    void vscode.window.showWarningMessage(msg);
  }
}

function mergeDrift(event: DriftEvent): void {
  if (state.dismissedDriftIds.has(event.id)) return;
  const idx = state.openDrifts.findIndex((d) => d.id === event.id);
  if (idx >= 0) state.openDrifts[idx] = event;
  else state.openDrifts.push(event);
  updateStatusBar();
}

function applyEditorDecorations(doc: vscode.TextDocument, drifts: DriftEvent[]): void {
  const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri === doc.uri);
  if (!editor) return;
  const ranges = drifts.map((d) => {
    const line = Math.max(0, (d.autoFix?.hunks[0]?.lineStart ?? 1) - 1);
    return new vscode.Range(line, 0, line, 1000);
  });
  editor.setDecorations(decorationType, ranges);
}

function clearDecorations(doc: vscode.TextDocument): void {
  const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri === doc.uri);
  editor?.setDecorations(decorationType, []);
}

function updateStatusBar(): void {
  if (!statusItem) return;
  const label = statusBarLabel(state.openDrifts);
  if (label) {
    statusItem.text = label;
    statusItem.color = new vscode.ThemeColor("errorForeground");
    statusItem.show();
  } else {
    statusItem.hide();
  }
}

function ensurePanel(title: string): vscode.WebviewPanel {
  if (panel) {
    panel.title = title;
    panel.reveal();
    return panel;
  }
  panel = vscode.window.createWebviewPanel("architectai", title, vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  panel.onDidDispose(() => {
    panel = undefined;
  });
  panel.webview.onDidReceiveMessage((msg: { type: string }) => void handlePanelMessage(msg));
  return panel;
}

async function handlePanelMessage(msg: { type: string }): Promise<void> {
  switch (msg.type) {
    case "pick-folder": {
      const cfg = state.config;
      if (!cfg) break;
      const picked = await pickOrCreateWorkspace();
      if (picked.kind === "cancelled") break;
      await finalizeWorkspaceConnection(cfg, state.exportBundleJson, picked.fsPath);
      break;
    }
    case "initialize":
      await initializeWorkspace();
      break;
    case "not-now":
    case "dismiss":
      panel?.dispose();
      break;
    case "accept-fix":
      await acceptAndApplyFix();
      break;
    case "ignore":
      await ignoreCurrentDrift();
      break;
    case "exception":
      void vscode.window.showInformationMessage(
        "Exception requests are submitted from the web dashboard (governance lead approval).",
      );
      break;
    case "dismiss-toast": {
      const d = state.openDrifts[state.selectedDriftIndex];
      if (d) state.dismissedDriftIds.add(d.id);
      await persistDismissed(store, state.dismissedDriftIds);
      state.openDrifts = state.openDrifts.filter((x) => x.id !== d?.id);
      updateStatusBar();
      showNormalPanel();
      break;
    }
    default:
      break;
  }
}

async function acceptAndApplyFix(): Promise<void> {
  const drift = state.openDrifts[state.selectedDriftIndex];
  if (!drift || !api) return;
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const result = applyFixToContent(editor.document.getText(), drift);
    if (result.conflict) {
      void vscode.window.showErrorMessage(
        "Fix conflict: file changed since drift was detected. Review manually.",
      );
      return;
    }
    if (result.applied) {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
      edit.replace(editor.document.uri, fullRange, result.content);
      await vscode.workspace.applyEdit(edit);
    }
  }
  await api.applyFix(drift.id);
  state.openDrifts = state.openDrifts.filter((d) => d.id !== drift.id);
  updateStatusBar();
  void vscode.window.showInformationMessage("✓ Fixed — drift score restored");
  setTimeout(() => showNormalPanel(), 500);
}

async function ignoreCurrentDrift(): Promise<void> {
  const drift = state.openDrifts[state.selectedDriftIndex];
  if (!drift || !api) return;
  const confirm = await vscode.window.showWarningMessage(
    "Mark as known? Drift remains in log but won't block CI.",
    "Confirm",
    "Cancel",
  );
  if (confirm !== "Confirm") return;
  await api.ignoreDrift(drift.id);
  state.openDrifts = state.openDrifts.filter((d) => d.id !== drift.id);
  updateStatusBar();
  showNormalPanel();
}

function showSetupPanel(): void {
  const cfg = state.config;
  const p = ensurePanel("ArchitectAI Setup");
  const pending = !vscode.workspace.workspaceFolders?.length;
  p.webview.html = setupPanelHtml(cfg?.architectureName ?? "Architecture", { pending });
}

function showNormalPanel(): void {
  state.panelMode = "normal";
  const cfg = state.config;
  const codes = cfg?.governanceRules.map((r) => r.code).slice(0, 3) ?? [
    "AP-001",
    "AP-002",
    "AP-003",
  ];
  const p = ensurePanel("ArchitectAI — Governed");
  const dashboardUrl =
    (process.env.ARCHITECTAI_WEB_URL ?? "http://localhost:5174").replace(/\/$/, "") + "/dashboard";
  const verifiedBaseline = manifestHasVerificationRun(state.exportBundleJson);
  p.webview.html = normalPanelHtml(cfg?.architectureName ?? "Architecture", codes, dashboardUrl, {
    verifiedBaseline,
  });
}

function manifestHasVerificationRun(bundleJson: string | null): boolean {
  if (!bundleJson) return false;
  try {
    const bundle = JSON.parse(bundleJson) as Record<string, unknown>;
    const manifest = bundle[".architectai/manifest.json"] as Record<string, unknown> | undefined;
    return typeof manifest?.verificationRunId === "string" && manifest.verificationRunId.length > 0;
  } catch {
    return false;
  }
}

function showDriftPanel(): void {
  if (state.openDrifts.length === 0) {
    showNormalPanel();
    return;
  }
  state.panelMode = "drift";
  const drift = state.openDrifts[state.selectedDriftIndex]!;
  const p = ensurePanel("ArchitectAI — Drift");
  p.webview.html = driftPanelHtml(
    drift,
    state.selectedDriftIndex,
    state.openDrifts.length,
  );
}

async function downloadFallback(): Promise<void> {
  const cfg = state.config;
  if (!cfg) {
    void vscode.window.showErrorMessage("Connect a workspace before downloading fallback bundle");
    return;
  }
  const archive = buildFallbackArchiveManifest(cfg, state.exportBundleJson);
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) return;
  for (const f of archive.files) {
    const uri = vscode.Uri.joinPath(root, f.path);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(f.content, "utf8"));
  }
  void vscode.window.showInformationMessage(
    `ArchitectAI: wrote ${archive.files.length} fallback files to .architectai/`,
  );
}

export { parseConnectUri, shouldMonitorFile, statusBarLabel, criticalDriftCount };
