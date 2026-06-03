import type { z } from "zod";
import { logger } from "@/lib/logger";
import { createAnthropicProvider } from "@/ai/providers/anthropic";
import { mockLlmProvider } from "@/ai/providers/mock";
import { mockVerificationProvider } from "@/ai/providers/mock-verification";
import type {
  GenerateStructuredParams,
  LlmProvider,
  LlmUsage,
  LlmWorkload,
} from "@/ai/providers/types";

export interface LlmGatewayConfig {
  /** @deprecated Use defaultProvider */
  provider?: LlmProvider;
  defaultProvider?: LlmProvider;
  generationProvider?: LlmProvider;
  verificationProvider?: LlmProvider;
  /** When set, reject further LLM calls after cumulative output tokens exceed this cap. */
  sessionMaxOutputTokens?: number;
}

/**
 * Provider-agnostic LLM gateway (v1). Routes workloads through a single entry point
 * for structured generation, retries, and cost metering. Phase 2 uses the mock
 * provider in tests; production swaps in Anthropic when `ANTHROPIC_API_KEY` is set.
 */
export class LlmGateway {
  private readonly providers: Record<LlmWorkload, LlmProvider>;
  private readonly sessionMaxOutputTokens?: number;
  private totalUsage = { inputTokens: 0, outputTokens: 0 };
  private usageByModel = new Map<string, { inputTokens: number; outputTokens: number }>();

  constructor(config: LlmGatewayConfig = {}) {
    this.sessionMaxOutputTokens = config.sessionMaxOutputTokens;
    const defaultProvider = config.defaultProvider ?? config.provider ?? mockLlmProvider;
    this.providers = {
      interrogation: defaultProvider,
      generation: config.generationProvider ?? defaultProvider,
      chat: defaultProvider,
      drift: defaultProvider,
      "verification-adjudication":
        config.verificationProvider ?? mockVerificationProvider,
    };
  }

  getProviderName(workload: LlmWorkload = "interrogation"): string {
    return this.providers[workload].name;
  }

  getProviderForWorkload(workload: LlmWorkload): LlmProvider {
    return this.providers[workload];
  }

  /** @deprecated Prefer getProviderName(workload) */
  getProviderNameLegacy(): string {
    return this.getProviderName("interrogation");
  }

  getMetering(): { inputTokens: number; outputTokens: number } {
    return { ...this.totalUsage };
  }

  getMeteringByModel(): Record<string, { inputTokens: number; outputTokens: number }> {
    const out: Record<string, { inputTokens: number; outputTokens: number }> = {};
    for (const [model, usage] of this.usageByModel.entries()) {
      out[model] = { ...usage };
    }
    return out;
  }

  resetMetering(): void {
    this.totalUsage = { inputTokens: 0, outputTokens: 0 };
    this.usageByModel.clear();
  }

  /**
   * Streaming entry point (Phase 3). Mock generation uses the deterministic runner;
   * production swaps in Anthropic streaming when the adapter lands.
   */
  async *stream(
    _params: { workload: "generation"; promptId: string; variables: Record<string, string> },
  ): AsyncGenerator<{ type: string; chunk: unknown }> {
    yield { type: "progress", chunk: { progress: 0 } };
  }

  async generateStructured<T extends z.ZodType>(
    params: GenerateStructuredParams<T>,
    opts?: { maxAttempts?: number },
  ): Promise<{ data: z.infer<T>; usage: LlmUsage }> {
    const provider = this.providers[params.workload];
    const maxAttempts = opts?.maxAttempts ?? 3;
    let lastError: unknown;

    if (
      this.sessionMaxOutputTokens != null &&
      this.totalUsage.outputTokens >= this.sessionMaxOutputTokens
    ) {
      throw new Error(
        `LLM session output token cap reached (${this.sessionMaxOutputTokens})`,
      );
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = Date.now();
      try {
        const result = await provider.generateStructured(params);
        const latencyMs = Date.now() - started;
        this.totalUsage.inputTokens += result.usage.inputTokens;
        this.totalUsage.outputTokens += result.usage.outputTokens;
        const key = result.usage.model || provider.name;
        const existing = this.usageByModel.get(key) ?? { inputTokens: 0, outputTokens: 0 };
        existing.inputTokens += result.usage.inputTokens;
        existing.outputTokens += result.usage.outputTokens;
        this.usageByModel.set(key, existing);
        logger.info(
          {
            workload: params.workload,
            promptId: params.promptId,
            provider: provider.name,
            model: result.usage.model,
            latencyMs,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            attempt,
          },
          "LLM request completed",
        );
        return result;
      } catch (err) {
        lastError = err;
        logger.warn(
          { err, promptId: params.promptId, workload: params.workload, attempt, maxAttempts },
          "LLM structured generation attempt failed",
        );
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 50 * attempt));
        }
      }
    }

    throw lastError;
  }
}

export function createLlmGateway(env: {
  LLM_PROVIDER?: "mock" | "anthropic" | "openai" | "oss";
  ANTHROPIC_API_KEY?: string;
  LLM_MODEL_INTERROGATION?: string;
  LLM_MODEL_GENERATION?: string;
  LLM_MODEL_ASSIST?: string;
  LLM_SESSION_MAX_OUTPUT_TOKENS?: number;
}): LlmGateway {
  const sessionCap = env.LLM_SESSION_MAX_OUTPUT_TOKENS;
  if (env.LLM_PROVIDER === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY");
    }
    if (
      !env.LLM_MODEL_INTERROGATION ||
      !env.LLM_MODEL_GENERATION ||
      !env.LLM_MODEL_ASSIST
    ) {
      throw new Error(
        "LLM_PROVIDER=anthropic requires LLM_MODEL_INTERROGATION, LLM_MODEL_GENERATION, and LLM_MODEL_ASSIST",
      );
    }
    const anthropic = createAnthropicProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      modelByWorkload: {
        interrogation: env.LLM_MODEL_INTERROGATION,
        generation: env.LLM_MODEL_GENERATION,
        chat: env.LLM_MODEL_ASSIST,
        drift: env.LLM_MODEL_ASSIST,
        "verification-adjudication": env.LLM_MODEL_ASSIST,
      },
    });
    logger.info(
      {
        provider: "anthropic",
        interrogationModel: env.LLM_MODEL_INTERROGATION,
        generationModel: env.LLM_MODEL_GENERATION,
        assistModel: env.LLM_MODEL_ASSIST,
      },
      "LLM gateway configured for Anthropic",
    );
    return new LlmGateway({
      defaultProvider: anthropic,
      generationProvider: anthropic,
      verificationProvider: anthropic,
      sessionMaxOutputTokens: sessionCap,
    });
  }

  if (env.LLM_PROVIDER && env.LLM_PROVIDER !== "mock") {
    logger.warn({ provider: env.LLM_PROVIDER }, "Unsupported LLM provider configured; using mock");
  }

  return new LlmGateway({
    defaultProvider: mockLlmProvider,
    generationProvider: mockLlmProvider,
    verificationProvider: mockVerificationProvider,
    sessionMaxOutputTokens: sessionCap,
  });
}
