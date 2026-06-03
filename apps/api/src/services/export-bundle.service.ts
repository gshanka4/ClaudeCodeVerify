import { desc, eq } from "drizzle-orm";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { recordAudit } from "@/services/audit.service";

export interface ExportBundleResult {
  format: "cursor-config";
  content: string;
  exportId: string;
  bundleKeys: string[];
}

/** Latest cursor-config export for a workspace's architecture (Phase I). */
export async function getExportBundleForWorkspace(
  tx: AppTx,
  workspaceId: string,
  architectureId: string,
): Promise<ExportBundleResult> {
  const [ws] = await tx
    .select()
    .from(schema.cursorWorkspaces)
    .where(eq(schema.cursorWorkspaces.id, workspaceId))
    .limit(1);
  if (!ws || ws.architectureId !== architectureId) {
    throw ApiError.forbidden("Workspace token does not match workspace id");
  }

  const [row] = await tx
    .select()
    .from(schema.architectureExports)
    .where(eq(schema.architectureExports.architectureId, architectureId))
    .orderBy(desc(schema.architectureExports.generatedAt))
    .limit(1);

  if (!row || row.format !== "cursor-config") {
    throw ApiError.notFound("No cursor-config export found for this architecture");
  }

  let bundleKeys: string[] = [];
  try {
    const parsed = JSON.parse(row.content) as Record<string, unknown>;
    bundleKeys = Object.keys(parsed);
  } catch {
    bundleKeys = [];
  }

  await recordAudit(tx, {
    organizationId: ws.organizationId,
    userId: ws.userId,
    eventType: "architecture.exported",
    resourceType: "cursor_workspace",
    resourceId: workspaceId,
    payload: { exportId: row.id, action: "bundle.pulled" },
  });

  return {
    format: "cursor-config",
    content: row.content,
    exportId: row.id,
    bundleKeys,
  };
}
