import type { ArchitectAiBundle, ExportBuildInput } from "@/export/types";
import { claudeCodeBundleToJson, type VerificationManifestStamp } from "@architectai/shared";

export function buildArchitectAiBundle(input: ExportBuildInput): ArchitectAiBundle {
  const { detail, rules, lockedVersion, organizationId, verificationStamp } = input;
  const patternRules = rules.filter((r) => r.type === "pattern" || r.type === "contract");

  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    architectureId: detail.id,
    organizationId,
    name: detail.name,
    version: lockedVersion,
    status: detail.status,
    environmentTarget: detail.environmentTarget,
    exportedAt: new Date().toISOString(),
    governanceScore: detail.governanceScore,
    driftScore: detail.driftScore,
  };

  if (verificationStamp) {
    applyVerificationStampToManifest(manifest, verificationStamp);
  }

  const rulesDoc = {
    version: lockedVersion,
    rules: rules.map((r) => ({
      id: r.id,
      code: r.code,
      type: r.type,
      severity: r.severity,
      name: r.name,
      enabled: r.enabled,
      condition: r.condition,
      autoFixStrategy: r.autoFixStrategy,
    })),
  };

  const boundaries = {
    version: lockedVersion,
    layers: detail.layers.map((l) => ({
      id: l.id,
      type: l.type,
      displayName: l.displayName,
      order: l.order,
    })),
    services: detail.services.map((s) => ({
      id: s.id,
      name: s.name,
      layer: s.layer,
      category: s.category,
    })),
  };

  const forbiddenPatterns = {
    version: lockedVersion,
    patterns: patternRules.map((r) => ({
      code: r.code,
      severity: r.severity,
      condition: r.condition,
      message: r.name,
    })),
  };

  const contracts = {
    version: lockedVersion,
    connections: detail.connections.map((c) => ({
      id: c.id,
      from: c.fromServiceId,
      to: c.toServiceId,
      protocol: c.protocol,
      authMethod: c.authMethod,
      isContractDefined: c.isContractDefined,
    })),
  };

  return { manifest, rules: rulesDoc, boundaries, forbiddenPatterns, contracts };
}

/** Stamp verification provenance into export manifest (FR-10 / D9). */
export function applyVerificationStampToManifest(
  manifest: Record<string, unknown>,
  stamp: VerificationManifestStamp,
): void {
  manifest.verificationRunId = stamp.verificationRunId;
  manifest.trustGrade = stamp.trustGrade;
  manifest.trustGradeBreakdown = stamp.trustGradeBreakdown;
  manifest.overrides = stamp.overrides;
}

export function bundleToCursorConfigJson(bundle: ArchitectAiBundle): string {
  return JSON.stringify(
    {
      ".architectai/manifest.json": bundle.manifest,
      ".architectai/rules.json": bundle.rules,
      ".architectai/boundaries.json": bundle.boundaries,
      ".architectai/forbidden-patterns.json": bundle.forbiddenPatterns,
      ".architectai/contracts.json": bundle.contracts,
    },
    null,
    2,
  );
}

export function bundleToClaudeCodeBundleJson(
  bundle: ArchitectAiBundle,
  opts?: { apiBaseUrl?: string; workspaceToken?: string },
): string {
  return claudeCodeBundleToJson(
    {
      manifest: bundle.manifest,
      rules: bundle.rules,
      boundaries: bundle.boundaries,
      forbiddenPatterns: bundle.forbiddenPatterns,
      contracts: bundle.contracts,
    },
    {
      apiBaseUrl: opts?.apiBaseUrl,
      workspaceTokenPlaceholder: opts?.workspaceToken,
      architectureId: String(bundle.manifest.architectureId ?? ""),
    },
  );
}
