import { MVP_EXPORT_FORMATS } from "@architectai/config";
import type { MvpExportFormat } from "@architectai/config";
import {
  buildArchitectAiBundle,
  bundleToClaudeCodeBundleJson,
  bundleToCursorConfigJson,
} from "@/export/build-artifacts";
import type { ExportBuildInput, ExportFormat, RenderedExport } from "@/export/types";
import { ApiError } from "@/lib/errors";

function renderOpenApi(bundle: ReturnType<typeof buildArchitectAiBundle>): string {
  const services = (bundle.boundaries.services as { name: string }[]) ?? [];
  const paths: Record<string, unknown> = {};
  for (const svc of services) {
    paths[`/${svc.name}`] = {
      get: { summary: `${svc.name} health`, responses: { "200": { description: "OK" } } },
    };
  }
  return JSON.stringify(
    {
      openapi: "3.0.3",
      info: {
        title: String(bundle.manifest.name ?? "Architecture"),
        version: String(bundle.manifest.version ?? 1),
      },
      paths,
    },
    null,
    2,
  );
}

function renderAdrMarkdown(bundle: ReturnType<typeof buildArchitectAiBundle>): string {
  const name = String(bundle.manifest.name ?? "Architecture");
  const version = String(bundle.manifest.version ?? 1);
  const services = (bundle.boundaries.services as { name: string; layer: string }[]) ?? [];
  const lines = [
    `# ADR: ${name}`,
    "",
    `**Status:** Accepted · **Version:** ${version}`,
    "",
    "## Context",
    `Exported governance bundle for ${name} at locked version ${version}.`,
    "",
    "## Services",
    ...services.map((s) => `- **${s.name}** (${s.layer})`),
    "",
    "## Governance rules",
    `See \`.architectai/rules.json\` (${(bundle.rules.rules as unknown[])?.length ?? 0} rules).`,
  ];
  return lines.join("\n");
}

export function renderExport(format: ExportFormat, input: ExportBuildInput): RenderedExport {
  const bundle = buildArchitectAiBundle(input);
  const baseName = input.detail.name.replace(/\s+/g, "-").toLowerCase();

  if (format === "terraform" || format === "pulumi") {
    throw ApiError.badRequest(
      `${format} export is deferred; MVP formats: ${MVP_EXPORT_FORMATS.join(", ")}`,
    );
  }

  if (format === "claude-code-bundle") {
    return {
      format,
      bundle,
      content: bundleToClaudeCodeBundleJson(bundle, {
        apiBaseUrl: process.env.PUBLIC_API_URL ?? process.env.API_PUBLIC_URL,
      }),
      filename: `${baseName}-v${input.lockedVersion}.claude-code.json`,
    };
  }

  if (format === "cursor-config") {
    return {
      format,
      bundle,
      content: bundleToCursorConfigJson(bundle),
      filename: `${baseName}-v${input.lockedVersion}.architectai.json`,
    };
  }

  if (format === "openapi") {
    return {
      format,
      bundle,
      content: renderOpenApi(bundle),
      filename: `${baseName}-v${input.lockedVersion}.openapi.json`,
    };
  }

  if (format === "adr-markdown") {
    return {
      format,
      bundle,
      content: renderAdrMarkdown(bundle),
      filename: `${baseName}-v${input.lockedVersion}.md`,
    };
  }

  throw ApiError.badRequest(`Unsupported export format: ${format}`);
}

export function assertMvpFormat(format: string): asserts format is MvpExportFormat {
  if (!(MVP_EXPORT_FORMATS as readonly string[]).includes(format)) {
    throw ApiError.badRequest(`Format must be one of: ${MVP_EXPORT_FORMATS.join(", ")}`);
  }
}
