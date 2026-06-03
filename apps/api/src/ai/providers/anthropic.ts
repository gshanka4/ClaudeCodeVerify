import type { z } from "zod";
import { INTERROGATION_NEXT_QUESTION_PROMPT } from "@/ai/prompts/interrogation";
import { INTERROGATION_PLAN_PROMPT } from "@/ai/prompts/interrogation-plan";
import { GENERATION_PLAN_PROMPT } from "@/ai/prompts/generation-plan";
import { normalizeGenerationBlueprint } from "@/ai/normalize-generation-blueprint";
import { VERIFICATION_ADJUDICATION_CROSSMODEL_PROMPT } from "@/ai/prompts/verification-adjudication";
import type { GenerateStructuredParams, LlmProvider, LlmUsage } from "@/ai/providers/types";

interface AnthropicProviderConfig {
  apiKey: string;
  modelByWorkload: {
    interrogation: string;
    generation: string;
    chat: string;
    drift: string;
    "verification-adjudication": string;
  };
  baseUrl?: string;
}

interface PromptSpec {
  system: string;
  userTemplate: string;
}

const promptRegistry: Record<string, PromptSpec> = {
  [INTERROGATION_NEXT_QUESTION_PROMPT.id]: INTERROGATION_NEXT_QUESTION_PROMPT,
  [INTERROGATION_PLAN_PROMPT.id]: INTERROGATION_PLAN_PROMPT,
  [GENERATION_PLAN_PROMPT.id]: GENERATION_PLAN_PROMPT,
  [VERIFICATION_ADJUDICATION_CROSSMODEL_PROMPT.id]: VERIFICATION_ADJUDICATION_CROSSMODEL_PROMPT,
};

function maxTokensForPrompt(promptId: string): number {
  if (promptId === INTERROGATION_PLAN_PROMPT.id) return 2200;
  if (promptId === GENERATION_PLAN_PROMPT.id) return 4096;
  if (promptId === INTERROGATION_NEXT_QUESTION_PROMPT.id) return 900;
  return 1200;
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? "");
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function normalizeInterrogationPayload(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const src = input as Record<string, unknown>;
  const questionText =
    (typeof src.questionText === "string" && src.questionText) ||
    (typeof src.question === "string" && src.question) ||
    (typeof src.prompt === "string" && src.prompt) ||
    "";
  const category = typeof src.category === "string" ? src.category : "scale";
  const rawOptions = Array.isArray(src.options) ? src.options : [];
  const options = rawOptions
    .map((o, idx) => {
      if (typeof o === "string") {
        return {
          id: `opt-${idx + 1}`,
          label: o,
          description: "",
          badge: null,
          badgeVariant: null,
        };
      }
      const r = (o ?? {}) as Record<string, unknown>;
      return {
        id: typeof r.id === "string" && r.id ? r.id : `opt-${idx + 1}`,
        label: typeof r.label === "string" ? r.label : String(r.title ?? `Option ${idx + 1}`),
        description: typeof r.description === "string" ? r.description : "",
        badge:
          r.badge === "AI Recommended" ||
          r.badge === "Common Choice" ||
          r.badge === "Enterprise Grade"
            ? r.badge
            : null,
        badgeVariant: r.badgeVariant === "violet" || r.badgeVariant === "emerald" || r.badgeVariant === "amber"
          ? r.badgeVariant
          : null,
      };
    })
    .slice(0, 4);

  return {
    ...src,
    questionText,
    category,
    options,
  };
}

function modelForWorkload(
  params: GenerateStructuredParams<z.ZodType>,
  cfg: AnthropicProviderConfig,
): string {
  return cfg.modelByWorkload[params.workload];
}

function inferModelFamily(requestedModel: string): "sonnet" | "opus" | "other" {
  const key = requestedModel.toLowerCase();
  if (key.includes("sonnet")) return "sonnet";
  if (key.includes("opus")) return "opus";
  return "other";
}

async function fetchAvailableAnthropicModels(
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  const res = await fetch(`${baseUrl}/v1/models`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) return [];
  const payload = (await res.json()) as { data?: Array<{ id?: string }> };
  return (payload.data ?? [])
    .map((m) => String(m.id ?? "").trim())
    .filter((id) => id.length > 0);
}

/** Claude 4+ models reject `temperature` on the Messages API. */
function supportsTemperatureParam(model: string): boolean {
  const m = model.toLowerCase();
  if (m.includes("claude-opus-4") || m.includes("claude-sonnet-4") || m.includes("claude-haiku-4")) {
    return false;
  }
  return true;
}

function pickFallbackModel(requestedModel: string, available: string[]): string | null {
  if (available.length === 0) return null;
  const family = inferModelFamily(requestedModel);
  if (family !== "other") {
    const familyMatches = available
      .filter((m) => m.toLowerCase().includes(family))
      .sort()
      .reverse();
    if (familyMatches[0]) return familyMatches[0];
  }
  return available.sort().reverse()[0] ?? null;
}

export function createAnthropicProvider(config: AnthropicProviderConfig): LlmProvider {
  const baseUrl = config.baseUrl ?? "https://api.anthropic.com";

  return {
    name: "anthropic",
    async generateStructured<T extends z.ZodType>(
      params: GenerateStructuredParams<T>,
    ): Promise<{ data: z.infer<T>; usage: LlmUsage }> {
      const prompt = promptRegistry[params.promptId];
      if (!prompt) {
        throw new Error(`Anthropic provider: unsupported prompt ${params.promptId}`);
      }

      const requestedModel = modelForWorkload(params, config);
      const runCall = (model: string) => {
        const body: Record<string, unknown> = {
          model,
          max_tokens: maxTokensForPrompt(params.promptId),
          system: prompt.system,
          messages: [
            {
              role: "user",
              content: renderTemplate(prompt.userTemplate, params.variables),
            },
          ],
        };
        if (supportsTemperatureParam(model)) {
          body.temperature = 0.2;
        }
        return fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        });
      };

      let res = await runCall(requestedModel);
      if (res.status === 404) {
        const available = await fetchAvailableAnthropicModels(baseUrl, config.apiKey);
        const fallbackModel = pickFallbackModel(requestedModel, available);
        if (fallbackModel && fallbackModel !== requestedModel) {
          res = await runCall(fallbackModel);
        }
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Anthropic API error ${res.status}: ${body}`);
      }

      const payload = (await res.json()) as {
        model: string;
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const text = payload.content?.find((b) => b.type === "text")?.text?.trim();
      if (!text) {
        throw new Error("Anthropic provider: empty text response");
      }

      const parsedJson = JSON.parse(extractJsonObject(text));
      const normalized =
        params.promptId === INTERROGATION_NEXT_QUESTION_PROMPT.id
          ? normalizeInterrogationPayload(parsedJson)
          : params.promptId === GENERATION_PLAN_PROMPT.id
            ? normalizeGenerationBlueprint(parsedJson)
            : parsedJson;
      const data = params.schema.parse(normalized);
      return {
        data: data as z.infer<T>,
        usage: {
          inputTokens: payload.usage?.input_tokens ?? 0,
          outputTokens: payload.usage?.output_tokens ?? 0,
          model: payload.model ?? requestedModel,
        },
      };
    },
  };
}
