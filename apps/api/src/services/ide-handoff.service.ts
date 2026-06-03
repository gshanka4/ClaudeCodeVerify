import { DEFAULT_IDE_TARGET, parseIdeTarget, type IdeTarget } from "@architectai/shared";
import { desc, eq } from "drizzle-orm";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import { buildIdeDeepLink } from "@/lib/ide-deeplink";
import { ApiError } from "@/lib/errors";

export interface IdeHandoffResult {
  deepLink: string;
  ide: IdeTarget;
  workspaceId: string;
}

export async function createIdeHandoff(
  tx: AppTx,
  architectureId: string,
  ideQuery?: string | null,
): Promise<IdeHandoffResult> {
  const [arch] = await tx
    .select({ id: schema.architectures.id, status: schema.architectures.status })
    .from(schema.architectures)
    .where(eq(schema.architectures.id, architectureId))
    .limit(1);
  if (!arch) throw ApiError.notFound("Architecture not found");

  const [latestExport] = await tx
    .select({ ideTarget: schema.architectureExports.ideTarget })
    .from(schema.architectureExports)
    .where(eq(schema.architectureExports.architectureId, architectureId))
    .orderBy(desc(schema.architectureExports.generatedAt))
    .limit(1);

  const ide: IdeTarget = parseIdeTarget(
    ideQuery ?? latestExport?.ideTarget ?? null,
    latestExport?.ideTarget ?? DEFAULT_IDE_TARGET,
  );

  const [workspace] = await tx
    .select()
    .from(schema.cursorWorkspaces)
    .where(eq(schema.cursorWorkspaces.architectureId, architectureId))
    .orderBy(desc(schema.cursorWorkspaces.createdAt))
    .limit(1);

  if (!workspace) {
    throw ApiError.conflict(
      "No IDE workspace registered for this architecture. Complete the export wizard first.",
    );
  }

  const freshToken = `ws_${crypto.randomUUID().replace(/-/g, "")}`;
  await tx
    .update(schema.cursorWorkspaces)
    .set({ apiToken: freshToken, lastConnectedAt: new Date(), ideTarget: ide })
    .where(eq(schema.cursorWorkspaces.id, workspace.id));

  const deepLink = buildIdeDeepLink(ide, freshToken, architectureId, workspace.id);
  return { deepLink, ide, workspaceId: workspace.id };
}
