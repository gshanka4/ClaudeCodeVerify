import type { GeneratedQuestion } from "@/ai/schemas/interrogation";
import { generatedQuestionSchema } from "@/ai/schemas/interrogation";

const FALLBACK_BY_INDEX: GeneratedQuestion[] = [
  {
    questionText:
      "What operational constraints should we assume if adaptive questioning is temporarily unavailable?",
    category: "scale",
    options: [
      {
        id: "fb-scale-a",
        label: "High throughput (10k+ RPS)",
        description: "Design for peak load with horizontal scaling.",
        badge: "Common Choice",
        badgeVariant: "emerald",
      },
      {
        id: "fb-scale-b",
        label: "Moderate internal API",
        description: "Standard REST services with caching at the edge.",
        badge: null,
        badgeVariant: null,
      },
    ],
    confidenceImpact: 12,
  },
  {
    questionText: "Which security baseline should we apply at service boundaries?",
    category: "security",
    options: [
      {
        id: "fb-sec-a",
        label: "mTLS between services",
        description: "Mutual TLS for east-west traffic.",
        badge: "AI Recommended",
        badgeVariant: "violet",
      },
      {
        id: "fb-sec-b",
        label: "JWT at API gateway only",
        description: "Simpler perimeter auth; internal trust zone.",
        badge: null,
        badgeVariant: null,
      },
    ],
    confidenceImpact: 14,
  },
  {
    questionText: "Which compliance scope is in scope for this architecture?",
    category: "compliance",
    options: [
      {
        id: "fb-comp-a",
        label: "PCI-DSS / SOC2",
        description: "Payment and audit controls from day one.",
        badge: null,
        badgeVariant: null,
      },
      {
        id: "fb-comp-b",
        label: "Defer formal compliance",
        description: "Document assumptions; revisit before production.",
        badge: "Common Choice",
        badgeVariant: "emerald",
      },
    ],
    confidenceImpact: 12,
  },
];

/**
 * Deterministic fallback when the LLM gateway exhausts retries (P2-EC-04).
 * Keeps the interrogation flow moving without exposing stack traces.
 */
export function buildInterrogationFallbackQuestion(questionIndex: number): GeneratedQuestion {
  const template = FALLBACK_BY_INDEX[questionIndex % FALLBACK_BY_INDEX.length]!;
  const options = template.options.map((opt, i) => ({
    ...opt,
    keyboardHint: (i + 1) as 1 | 2 | 3 | 4,
  }));
  return generatedQuestionSchema.parse({ ...template, options });
}
