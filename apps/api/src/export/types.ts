import type { ArchitectureDetailDto } from "@/services/architectures.service";
import type { GovernanceRule } from "@architectai/shared";

export interface ArchitectAiBundle {
  manifest: Record<string, unknown>;
  rules: Record<string, unknown>;
  boundaries: Record<string, unknown>;
  forbiddenPatterns: Record<string, unknown>;
  contracts: Record<string, unknown>;
}

export interface ExportBuildInput {
  detail: ArchitectureDetailDto;
  rules: GovernanceRule[];
  lockedVersion: number;
  organizationId: string;
  verificationStamp?: import("@architectai/shared").VerificationManifestStamp;
}

export type ExportFormat =
  | "terraform"
  | "pulumi"
  | "openapi"
  | "adr-markdown"
  | "claude-code-bundle"
  | "cursor-config";

export interface RenderedExport {
  format: ExportFormat;
  content: string;
  filename: string;
  bundle: ArchitectAiBundle;
}
