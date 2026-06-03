/**
 * PRD functional requirement → spec delta mapping (V0-DOC-01).
 * @see `new_PRD_updated.md` §10, `IMPLEMENTATION_PLAN_v3.md` §2
 */

export interface FrDeltaMapping {
  fr: string;
  summary: string;
  deltas: Array<"D7" | "D8" | "D9" | "D10" | "D11" | "D12">;
  phase: string;
}

/** FR-1 is existing generation — confirmed, not a v3 delta. */
export const VERIFICATION_FR_DELTA_MAP: FrDeltaMapping[] = [
  {
    fr: "FR-2",
    summary: "Auto-trigger Verification Pass on generation complete",
    deltas: ["D9", "D10"],
    phase: "V3",
  },
  {
    fr: "FR-3",
    summary: "Tier-1 deterministic checks, P95 < 2s, LLM-free",
    deltas: ["D7", "D8"],
    phase: "V2",
  },
  {
    fr: "FR-4",
    summary: "Tier-2 probabilistic checks streamed",
    deltas: ["D7", "D9"],
    phase: "V5",
  },
  {
    fr: "FR-5",
    summary: "Persist findings with full verdict model",
    deltas: ["D7", "D8"],
    phase: "V1",
  },
  {
    fr: "FR-6",
    summary: "Canvas verdict projection + stacked panel",
    deltas: ["D10"],
    phase: "V4",
  },
  {
    fr: "FR-7",
    summary: "Lineage Graph verification overlay",
    deltas: ["D10", "D11"],
    phase: "VF",
  },
  {
    fr: "FR-8",
    summary: "Lock gated on deterministic conflicts",
    deltas: ["D9", "D10"],
    phase: "V3",
  },
  {
    fr: "FR-9",
    summary: "Override-with-reason → immutable audit",
    deltas: ["D7", "D8", "D9"],
    phase: "V3",
  },
  {
    fr: "FR-10",
    summary: "Export requires completed run + manifest stamp",
    deltas: ["D9"],
    phase: "V6",
  },
  {
    fr: "FR-11",
    summary: "Re-run verify on version bump",
    deltas: ["D9"],
    phase: "V3",
  },
  {
    fr: "FR-12",
    summary: "Trust Grade with breakdown",
    deltas: ["D7", "D10"],
    phase: "V2-V4",
  },
  {
    fr: "FR-13",
    summary: "Verifier reliability published",
    deltas: ["D10"],
    phase: "VF",
  },
  {
    fr: "FR-14",
    summary: "Drift feeds Trust Grade (unchanged mechanics)",
    deltas: ["D7", "D10"],
    phase: "VF",
  },
];

export const PRD_FR_IDS = [
  "FR-2",
  "FR-3",
  "FR-4",
  "FR-5",
  "FR-6",
  "FR-7",
  "FR-8",
  "FR-9",
  "FR-10",
  "FR-11",
  "FR-12",
  "FR-13",
  "FR-14",
] as const;
