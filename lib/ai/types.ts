// Provider-agnostic AI contract. The Gemini implementation lives in
// lib/ai/gemini.ts; swapping in Claude later means adding lib/ai/claude.ts and
// changing getAiProvider() in lib/ai/index.ts — nothing else.

export type AiTier = "lite" | "standard";

export interface AiGenerateRequest {
  tier: AiTier;
  system?: string;
  prompt: string;
  /** JSON Schema; when set the provider must return valid JSON text. */
  jsonSchema?: object;
  maxOutputTokens?: number;
}

export type AiResult =
  | { ok: true; text: string; model: string }
  | { ok: false; skipped?: boolean; error?: string };

export interface AiProvider {
  generate(req: AiGenerateRequest): Promise<AiResult>;
}
