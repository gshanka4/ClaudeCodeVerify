export interface ConnectParams {
  token: string;
  architectureId: string;
  workspaceId?: string;
  handoffSessionId?: string;
}

export interface ParsedUri {
  scheme: string;
  authority: string;
  path: string;
  query: string;
}

const SUPPORTED_SCHEMES = new Set(["cursor", "vscode", "antigravity"]);

/** Parse `{scheme}://architectai/connect?token=…` for supported IDEs (P7/C-UT-02). */
export function parseConnectUri(uri: ParsedUri | string): ConnectParams | null {
  const parts = typeof uri === "string" ? parseUriString(uri) : uri;
  if (!parts) return null;
  if (!SUPPORTED_SCHEMES.has(parts.scheme)) return null;
  if (parts.authority !== "architectai") return null;
  if (parts.path !== "/connect" && parts.path !== "connect") return null;

  const params = new URLSearchParams(parts.query.replace(/^\?/, ""));
  const token = params.get("token");
  const architectureId = params.get("architectureId");
  if (!token || !architectureId) return null;

  const handoffSessionId = params.get("handoffSessionId");
  return {
    token,
    architectureId,
    workspaceId: params.get("workspaceId") ?? undefined,
    handoffSessionId: handoffSessionId ?? undefined,
  };
}

export function buildConnectUri(
  token: string,
  architectureId: string,
  workspaceId?: string,
  scheme: "cursor" | "vscode" | "antigravity" = "cursor",
): string {
  const params = new URLSearchParams({ token, architectureId });
  if (workspaceId) params.set("workspaceId", workspaceId);
  return `${scheme}://architectai/connect?${params.toString()}`;
}

function parseUriString(raw: string): ParsedUri | null {
  try {
    const u = new URL(raw);
    return {
      scheme: u.protocol.replace(/:$/, ""),
      authority: u.host,
      path: u.pathname,
      query: u.search,
    };
  } catch {
    return null;
  }
}
