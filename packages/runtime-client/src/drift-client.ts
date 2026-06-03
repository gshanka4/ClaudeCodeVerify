import type { ArchitectAiCredentials } from "./credentials";

export interface DriftCheckPayload {
  architectureId: string;
  filePath: string;
  fileContent: string;
}

export interface DriftViolation {
  ruleCode?: string;
  ruleName?: string;
  whatHappened?: string;
  severity?: string;
}

export interface DriftCheckResult {
  hasDrift: boolean;
  drifts: DriftViolation[];
  newDriftScore?: number;
}

const MAX_CONTENT = 500_000;

export function truncateContent(content: string): string {
  if (content.length <= MAX_CONTENT) return content;
  return content.slice(0, MAX_CONTENT);
}

export async function postDriftCheck(
  creds: ArchitectAiCredentials,
  payload: DriftCheckPayload,
  fetchFn: typeof fetch = fetch,
): Promise<DriftCheckResult> {
  const url = `${creds.apiBaseUrl}/api/drift/check`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.workspaceToken}`,
    },
    body: JSON.stringify({
      architectureId: creds.architectureId,
      filePath: payload.filePath,
      fileContent: truncateContent(payload.fileContent),
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    data?: DriftCheckResult;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(body.message ?? `Drift check failed (${res.status})`);
  }

  const data = body.data ?? (body as unknown as DriftCheckResult);
  return {
    hasDrift: Boolean(data.hasDrift),
    drifts: Array.isArray(data.drifts) ? data.drifts : [],
    newDriftScore: data.newDriftScore,
  };
}

export function formatDriftStderr(drifts: DriftViolation[]): string {
  return drifts
    .map((d) => {
      const code = d.ruleCode ?? "DRIFT";
      const name = d.ruleName ? ` (${d.ruleName})` : "";
      const msg = d.whatHappened ?? "Governance violation";
      return `[ArchitectAI ${code}${name}] ${msg}`;
    })
    .join("\n");
}
