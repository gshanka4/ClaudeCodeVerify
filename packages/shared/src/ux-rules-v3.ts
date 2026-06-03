/**
 * v3.0 non-negotiable UX rules 14–19 (`new_PRD_updated.md` §5, spec delta D10).
 * Canonical list for V0-EC-06 checklist tests and Playwright gates (V4+).
 */

export interface UxRuleV3 {
  number: number;
  summary: string;
}

export const UX_RULES_V3: UxRuleV3[] = [
  {
    number: 14,
    summary:
      "Deterministic and probabilistic verdicts are visually distinct (proven vs signal-not-proof).",
  },
  {
    number: 15,
    summary: "Probabilistic findings never block Lock and are never shown as fact.",
  },
  {
    number: 16,
    summary: "Ungrounded provenance is flagged, never rendered as fact.",
  },
  {
    number: 17,
    summary: "Override requires a typed reason; immutable audit; irreversible without re-edit.",
  },
  {
    number: 18,
    summary: "Trust Grade always shows breakdown on hover/expand — never a bare number.",
  },
  {
    number: 19,
    summary: "Conflicts use red; amber reserved for unverified/uncertain only.",
  },
];

export const UX_RULES_V3_NUMBERS = UX_RULES_V3.map((r) => r.number);
