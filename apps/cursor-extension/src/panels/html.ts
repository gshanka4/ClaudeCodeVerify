import type { DriftEvent } from "@architectai/shared";
import { criticalDriftCount } from "../lib/state";

const BASE_STYLE = `
  body { font-family: system-ui, sans-serif; background: #090a0f; color: #d4d9e4; margin: 0; padding: 16px; }
  h1 { font-size: 14px; margin: 0 0 8px; }
  .muted { color: #8b95a5; font-size: 12px; }
  .btn { border-radius: 8px; padding: 8px 14px; font-size: 12px; cursor: pointer; }
  .btn-primary { background: #6366f1; color: white; border: none; }
  .btn-bordered { background: transparent; border: 1px solid #454545; color: #cccccc; }
  .btn-bordered-warn { background: transparent; border: 1px solid #454545; color: #cccccc; }
  .sub { font-size: 10px; color: #555555; display: block; margin-top: 4px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; background: rgba(99,102,241,0.12); color: #818cf8; }
  .check { color: #10b981; font-size: 12px; }
  .row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  pre { background: #11131a; border: 1px solid #1f2333; padding: 8px; font-size: 11px; overflow: auto; }
  a.link { color: #818cf8; font-size: 12px; }
`;

export function setupPanelHtml(
  architectureName: string,
  options?: { pending?: boolean },
): string {
  const pending = options?.pending ?? false;
  const title = pending ? "Pick a folder" : "Initialize Workspace";
  const lead = pending
    ? `First-time setup: pick the repo folder for <strong>${escapeHtml(architectureName)}</strong>. The web app will continue once artifacts are written.`
    : `Connect <strong>${escapeHtml(architectureName)}</strong> and write governed <code>.architectai/</code> artifacts.`;
  const primaryLabel = pending ? "Pick a folder" : "Initialize Workspace";
  const primaryAction = pending ? "pick-folder" : "initialize";

  return `<!DOCTYPE html><html><head><style>${BASE_STYLE}</style></head><body data-panel="setup" data-pending="${pending ? "true" : "false"}">
  <h1>${title}</h1>
  <p class="muted">${lead}</p>
  <div class="row">
    <button class="btn btn-primary" data-action="${primaryAction}">${primaryLabel}</button>
    <button class="btn btn-bordered" data-action="not-now">Not now</button>
  </div>
  <p class="sub">⎋ Esc to dismiss</p>
  <script>
    const vscode = acquireVsCodeApi();
    document.querySelector('[data-action="${primaryAction}"]')?.addEventListener('click', () => vscode.postMessage({ type: '${primaryAction}' }));
    document.querySelector('[data-action="not-now"]')?.addEventListener('click', () => vscode.postMessage({ type: 'not-now' }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') vscode.postMessage({ type: 'dismiss' }); });
  </script>
</body></html>`;
}

export function normalPanelHtml(
  architectureName: string,
  rules: string[],
  dashboardUrl = "http://localhost:5174/dashboard",
  options?: { verifiedBaseline?: boolean },
): string {
  const badge = options?.verifiedBaseline
    ? `<div class="badge" data-testid="extension-verified-badge">Verified baseline · governed</div>`
    : `<div class="badge" data-testid="extension-governed-badge">Governed</div>`;
  const checks = rules
    .map((code) => `<div class="check">${escapeHtml(code)} ✓ Clear</div>`)
    .join("");
  return `<!DOCTYPE html><html><head><style>${BASE_STYLE}</style></head><body data-panel="normal">
  ${badge}
  <h1>${escapeHtml(architectureName)}</h1>
  <p class="muted">MONITORING ACTIVE</p>
  ${checks || '<div class="check">AP-001 ✓ Clear</div><div class="check">AP-002 ✓ Clear</div><div class="check">AP-003 ✓ Clear</div>'}
  <p class="muted" style="margin-top:12px">⌘L — context-loaded architecture chat</p>
  <p style="margin-top:8px"><a class="link" href="${escapeHtml(dashboardUrl)}" data-testid="extension-dashboard-link">Open dashboard</a></p>
</body></html>`;
}

export function driftPanelHtml(drift: DriftEvent, index: number, total: number): string {
  const scoreLine = `<div><span>Drift score +${drift.driftScore}</span><span class="sub">deducts from governance grade</span></div>`;
  const diff = drift.autoFix
    ? `<pre>${escapeHtml(JSON.stringify(drift.autoFix.hunks, null, 2))}</pre>`
    : "<p class=\"muted\">No auto-fix available</p>";

  return `<!DOCTYPE html><html><head><style>${BASE_STYLE}
  .severity { color: #ef4444; font-weight: 600; }
  </style></head><body data-panel="drift">
  <p class="muted">Drift ${index + 1} of ${total} · ${criticalDriftCount([drift]) > 0 ? "Critical" : drift.severity}</p>
  <h1 class="severity">${escapeHtml(drift.ruleCode)} — ${escapeHtml(drift.ruleName)}</h1>
  <p>${escapeHtml(drift.whatHappened)}</p>
  ${scoreLine}
  <h2 style="font-size:12px;margin-top:16px">Agreed vs Current</h2>
  <pre>${escapeHtml(JSON.stringify(drift.agreedContract))}</pre>
  <pre>${escapeHtml(JSON.stringify(drift.currentViolation))}</pre>
  <h2 style="font-size:12px">Auto-fix diff</h2>
  ${diff}
  <div class="row">
    <button class="btn btn-primary" data-action="accept-fix">Accept &amp; Apply Fix</button>
    <button class="btn btn-bordered" data-action="ignore">Ignore drift<span class="sub">marks as known, stays in log</span></button>
    <button class="btn btn-bordered-warn" data-action="exception">Request Exception<span class="sub">routes to governance lead</span></button>
  </div>
  <div class="row">
    <button class="btn btn-bordered" data-action="dismiss-toast">Dismiss<span class="sub">won't remind again</span></button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const post = (type) => () => vscode.postMessage({ type });
    document.querySelector('[data-action="accept-fix"]')?.addEventListener('click', post('accept-fix'));
    document.querySelector('[data-action="ignore"]')?.addEventListener('click', post('ignore'));
    document.querySelector('[data-action="exception"]')?.addEventListener('click', post('exception'));
    document.querySelector('[data-action="dismiss-toast"]')?.addEventListener('click', post('dismiss-toast'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') vscode.postMessage({ type: 'dismiss' }); });
  </script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
