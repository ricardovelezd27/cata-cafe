import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { AiGenerateRequest, AiProvider, AiResult } from "./types";

// Gemini implementation of AiProvider. Mirrors lib/email.ts's graceful
// degradation: without GEMINI_API_KEY every call resolves
// { ok: false, skipped: true } and the UI shows "AI not configured" — nothing
// throws, nothing blocks.

const DEFAULT_MODELS: Record<AiGenerateRequest["tier"], string> = {
  lite: process.env.GEMINI_MODEL_LITE || "gemini-3.1-flash-lite",
  standard: process.env.GEMINI_MODEL_STANDARD || "gemini-3.5-flash",
};

const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

let warnedMissingKey = false;
let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.warn("[ai] GEMINI_API_KEY not set — AI narrative generation disabled.");
      warnedMissingKey = true;
    }
    return null;
  }
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

async function generateOnce(
  ai: GoogleGenAI,
  model: string,
  req: AiGenerateRequest,
): Promise<AiResult> {
  const response = await ai.models.generateContent({
    model,
    contents: req.prompt,
    config: {
      ...(req.system ? { systemInstruction: req.system } : {}),
      maxOutputTokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      ...(req.jsonSchema
        ? { responseMimeType: "application/json", responseSchema: req.jsonSchema }
        : {}),
    },
  });
  const text = response.text;
  if (!text) return { ok: false, error: "empty_response" };
  return { ok: true, text, model };
}

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(500|502|503|504|overloaded|unavailable)\b/i.test(msg);
}

export function createGeminiProvider(): AiProvider {
  return {
    async generate(req) {
      const ai = getClient();
      if (!ai) return { ok: false, skipped: true };
      const model = DEFAULT_MODELS[req.tier];
      try {
        return await generateOnce(ai, model, req);
      } catch (err) {
        if (isRetryable(err)) {
          try {
            return await generateOnce(ai, model, req);
          } catch (retryErr) {
            console.error("[ai] Gemini retry failed:", retryErr);
            return { ok: false, error: "provider_error" };
          }
        }
        console.error("[ai] Gemini call failed:", err);
        return { ok: false, error: "provider_error" };
      }
    },
  };
}
