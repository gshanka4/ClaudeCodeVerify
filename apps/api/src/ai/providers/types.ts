import type { z } from "zod";

export type LlmWorkload =
  | "interrogation"
  | "generation"
  | "chat"
  | "drift"
  | "verification-adjudication";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface GenerateStructuredParams<T extends z.ZodType> {
  workload: LlmWorkload;
  promptId: string;
  schema: T;
  variables: Record<string, string>;
}

export interface LlmProvider {
  readonly name: string;
  generateStructured<T extends z.ZodType>(
    params: GenerateStructuredParams<T>,
  ): Promise<{ data: z.infer<T>; usage: LlmUsage }>;
}
