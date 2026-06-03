import type { CursorConfig, DriftEvent, ExportBundleResponse } from "@architectai/shared";

export interface DriftCheckResult {
  hasDrift: boolean;
  drifts: DriftEvent[];
  newDriftScore: number;
}

export interface ApiClientOptions {
  fetchFn?: typeof fetch;
  getToken: () => string | null;
  getConfig: () => CursorConfig | null;
}

export class ArchitectApiClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: ApiClientOptions) {
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  private token(): string {
    const t = this.opts.getToken();
    if (!t) throw new Error("Workspace token not configured");
    return t;
  }

  private config(): CursorConfig {
    const c = this.opts.getConfig();
    if (!c) throw new Error("CursorConfig not loaded");
    return c;
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchFn(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token()}`,
        ...(init.headers as Record<string, string>),
      },
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: T;
      message?: string;
    };
    if (!res.ok) {
      throw new ApiClientError(res.status, body.message ?? res.statusText);
    }
    return body.data as T;
  }

  async pullConfig(workspaceId: string): Promise<CursorConfig> {
    const base = this.configBaseUrl();
    const data = await this.request<{ cursorConfig: CursorConfig }>(
      `${base}/api/cursor/workspaces/${workspaceId}/config`,
    );
    return data.cursorConfig;
  }

  async pullExportBundle(workspaceId: string): Promise<ExportBundleResponse> {
    const base = this.configBaseUrl();
    return this.request<ExportBundleResponse>(
      `${base}/api/cursor/workspaces/${workspaceId}/export-bundle`,
    );
  }

  async checkDrift(filePath: string, fileContent: string): Promise<DriftCheckResult> {
    const cfg = this.config();
    const data = await this.request<DriftCheckResult & { currentDriftScore?: number }>(
      cfg.driftCheckEndpoint,
      {
        method: "POST",
        body: JSON.stringify({
          architectureId: cfg.architectureId,
          filePath,
          fileContent,
        }),
      },
    );
    return {
      hasDrift: data.hasDrift,
      drifts: data.drifts,
      newDriftScore: data.newDriftScore ?? data.currentDriftScore ?? 0,
    };
  }

  async applyFix(driftId: string): Promise<{ applied: boolean }> {
    const base = this.configBaseUrl();
    return this.request<{ applied: boolean }>(
      `${base}/api/drift/workspace/${driftId}/apply-fix`,
      { method: "POST", body: "{}" },
    );
  }

  async patchWorkspacePath(workspaceId: string, workspacePath: string): Promise<void> {
    const base = this.configBaseUrl();
    await this.request(
      `${base}/api/cursor/workspaces/${workspaceId}`,
      { method: "PATCH", body: JSON.stringify({ workspacePath }) },
    );
  }

  async reportHandoffWorkspaceLinked(
    workspaceId: string,
    handoffSessionId: string,
  ): Promise<void> {
    const base = this.configBaseUrl();
    await this.request(
      `${base}/api/cursor/workspaces/${workspaceId}/handoff-linked`,
      { method: "POST", body: JSON.stringify({ handoffSessionId }) },
    );
  }

  async ignoreDrift(driftId: string): Promise<{ ignored: boolean }> {
    const base = this.configBaseUrl();
    return this.request<{ ignored: boolean }>(
      `${base}/api/drift/workspace/${driftId}/ignore`,
      { method: "POST", body: "{}" },
    );
  }

  private configBaseUrl(): string {
    const endpoint = this.config().driftCheckEndpoint;
    const idx = endpoint.indexOf("/api/drift");
    return idx > 0 ? endpoint.slice(0, idx) : "http://localhost:4000";
  }
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }

  get needsReauth(): boolean {
    return this.status === 401 || this.status === 403;
  }
}
