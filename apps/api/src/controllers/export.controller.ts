import { IDE_TARGETS } from "@architectai/shared";
import type { RequestHandler } from "express";
import { z } from "zod";
import type { AppContext } from "@/context";
import { withTenant } from "@/db/client";
import { ok } from "@/lib/http";
import { parseOrThrow } from "@/lib/validate";
import * as exportService from "@/services/export.service";
import type { InMemoryDriftHub } from "@/drift/drift-hub";

const bodySchema = z.object({
  format: z.enum([
    "terraform",
    "pulumi",
    "openapi",
    "adr-markdown",
    "claude-code-bundle",
    "cursor-config",
  ]),
  ideTarget: z.enum(IDE_TARGETS).optional(),
});

export interface ExportController {
  export: RequestHandler;
}

export function exportController(ctx: AppContext): ExportController {
  const exportArch: RequestHandler = (req, res, next) => {
    const auth = req.auth!;
    const architectureId = parseOrThrow(z.string().uuid(), req.params.architectureId);
    const body = parseOrThrow(bodySchema, req.body);
    withTenant(ctx.db, auth, (tx) =>
      exportService.exportArchitecture(
        tx,
        auth,
        architectureId,
        body.format,
        body.ideTarget ?? "claude-code",
      ),
    )
      .then((result) => {
        if (result.isReexport) {
          publishArchitectureUpdated(ctx.driftHub, architectureId, result.version);
        }
        ok(res, {
          format: result.format,
          content: result.content,
          filename: result.filename,
          exportId: result.exportId,
          version: result.version,
          architectAi: result.bundleKeys,
        });
      })
      .catch(next);
  };

  return { export: exportArch };
}

function publishArchitectureUpdated(
  hub: InMemoryDriftHub,
  architectureId: string,
  version: number,
): void {
  hub.publishForArchitecture(architectureId, {
    type: "architecture.updated",
    payload: { architectureId, version },
  });
}
