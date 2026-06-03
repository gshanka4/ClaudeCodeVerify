import {
  generatedQuestionSchema,
  type GeneratedQuestion,
} from "@/ai/schemas/interrogation";
import { INTERROGATION } from "@architectai/config";

const CATEGORY_ORDER = ["scale", "security", "compliance"] as const;

const MOCK_QUESTIONS: Record<string, Partial<GeneratedQuestion>> = {
  scale: {
    questionText: "What peak throughput and latency targets should the architecture satisfy?",
    category: "scale",
    options: [
      {
        id: "scale-a",
        label: "10k RPS / P95 < 200ms",
        description: "High-traffic API tier with regional caching.",
        badge: "AI Recommended",
        badgeVariant: "violet",
      },
      {
        id: "scale-b",
        label: "1k RPS / P95 < 500ms",
        description: "Moderate internal service mesh.",
        badge: null,
        badgeVariant: null,
      },
    ],
    confidenceImpact: 18,
  },
  security: {
    questionText: "Which security posture applies at the trust boundary?",
    category: "security",
    options: [
      {
        id: "sec-a",
        label: "Zero-trust + mTLS everywhere",
        description: "Mutual TLS between all services.",
        badge: "Enterprise Grade",
        badgeVariant: "amber",
      },
      {
        id: "sec-b",
        label: "JWT at edge, mTLS internal",
        description: "Gateway terminates JWT; east-west mTLS.",
        badge: "AI Recommended",
        badgeVariant: "violet",
      },
    ],
    confidenceImpact: 20,
  },
  compliance: {
    questionText: "Which compliance frameworks must be designed in from day one?",
    category: "compliance",
    options: [
      {
        id: "comp-a",
        label: "PCI DSS + SOC 2",
        description: "Payment and operational controls.",
        badge: "AI Recommended",
        badgeVariant: "violet",
      },
      {
        id: "comp-b",
        label: "HIPAA",
        description: "Healthcare data handling.",
        badge: null,
        badgeVariant: null,
      },
    ],
    confidenceImpact: 16,
  },
};

export function buildMockQuestion(index: number, categoriesUsed: string[] = []): GeneratedQuestion {
  const category =
    CATEGORY_ORDER.find((c) => !categoriesUsed.includes(c)) ??
    CATEGORY_ORDER[index % CATEGORY_ORDER.length]!;
  const template = MOCK_QUESTIONS[category]!;
  const options = (template.options ?? []).map((opt, i) => ({
    ...opt,
    keyboardHint: (i + 1) as 1 | 2 | 3 | 4,
  }));
  return generatedQuestionSchema.parse({
    ...template,
    options,
    suggestComplete: index >= INTERROGATION.maxQuestions - 1,
  });
}

export function buildMockQuestionBatch(): GeneratedQuestion[] {
  const used: string[] = [];
  const out: GeneratedQuestion[] = [];
  for (let i = 0; i < INTERROGATION.maxQuestions; i++) {
    const q = buildMockQuestion(i, used);
    used.push(q.category);
    out.push(q);
  }
  return out;
}
