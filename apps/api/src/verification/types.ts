import type {
  ArchitectureLineage,
  GovernanceRule,
  GroundTruthSource,
  VerificationCheck,
  VerificationTier,
  VerificationVerdict,
} from "@architectai/shared";
import type { ReferentialContext } from "@/generation/lineage-integrity";
import type {
  ArchServiceDto,
  ServiceConnectionDto,
} from "@/services/architectures.service";

export interface RequirementGroundTruth {
  questionId: string;
  label: string;
}

/** In-memory snapshot for Tier-1 deterministic checks. */
export interface VerificationContext {
  architectureId: string;
  version: number;
  services: ArchServiceDto[];
  connections: ServiceConnectionDto[];
  lineage: ArchitectureLineage;
  requirements: RequirementGroundTruth[];
  rules: GovernanceRule[];
  referentialContext: ReferentialContext;
  hasInterrogationSession: boolean;
}

/** Finding emitted by a check before persistence (ids assigned in run-tier1). */
export interface Tier1FindingDraft {
  architectureId: string;
  serviceId?: string;
  lineageNodeId?: string;
  check: VerificationCheck;
  tier: VerificationTier;
  verdict: VerificationVerdict;
  confidence: number;
  groundTruthSource: GroundTruthSource;
  detail: string;
  evidenceRef?: string;
}

export interface Tier1Finding extends Tier1FindingDraft {
  id: string;
}

export const TIER1_ENGINE_VERSION = "tier1-v1.0.0";
