// Provider-agnostic AI contract. The Gemini implementation lives in
// lib/ai/gemini.ts; swapping in Claude later means adding lib/ai/claude.ts and
// changing getAiProvider() in lib/ai/index.ts — nothing else.

export type AiTier = "lite" | "standard" | "pro";

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

export type AiChatRole = "user" | "model";

export interface AiToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AiToolResponse {
  id?: string;
  name: string;
  response: Record<string, unknown>;
}

export interface AiChatMessage {
  role: AiChatRole;
  text?: string;
  toolCalls?: AiToolCall[]; // model turns that requested tools
  toolResponses?: AiToolResponse[]; // user turns answering prior calls
  /** Opaque provider round-trip payload (Gemini raw Content, preserves thoughtSignature).
   *  Set + consumed only by the provider; never sent to the client. */
  providerRaw?: unknown;
}

/** Plain JSON Schema — provider maps this into its own function-declaration shape. */
export interface AiToolDef {
  name: string;
  description: string;
  parameters: object;
}

export interface AiChatRequest {
  tier: AiTier;
  system?: string;
  messages: AiChatMessage[];
  tools?: AiToolDef[];
  maxOutputTokens?: number;
  temperature?: number;
}

export interface AiUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type AiChatResult =
  | { ok: true; message: AiChatMessage; model: string; usage: AiUsage }
  | { ok: false; skipped?: boolean; error?: string };

export interface AiProvider {
  generate(req: AiGenerateRequest): Promise<AiResult>;
  chat(req: AiChatRequest): Promise<AiChatResult>;
}
