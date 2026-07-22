import "server-only";
import { GoogleGenAI, FunctionCallingConfigMode } from "@google/genai";
import type { Content, Part } from "@google/genai";
import type {
  AiChatMessage,
  AiChatRequest,
  AiChatResult,
  AiGenerateRequest,
  AiProvider,
  AiResult,
} from "./types";

// Gemini implementation of AiProvider. Mirrors lib/email.ts's graceful
// degradation: without GEMINI_API_KEY every call resolves
// { ok: false, skipped: true } and the UI shows "AI not configured" — nothing
// throws, nothing blocks.

const DEFAULT_MODELS: Record<AiGenerateRequest["tier"], string> = {
  lite: process.env.GEMINI_MODEL_LITE || "gemini-3.1-flash-lite",
  standard: process.env.GEMINI_MODEL_STANDARD || "gemini-3.5-flash",
  // No stable 3.x pro exists on the API yet (verified via ListModels 2026-07-22);
  // pin a newer id via GEMINI_MODEL_PRO when one ships.
  pro: process.env.GEMINI_MODEL_PRO || "gemini-3.1-pro-preview",
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

// A model turn that carries providerRaw is replayed verbatim — that raw
// Content is the only place Gemini 3.x's thoughtSignature survives, and
// reconstructing the turn from text/toolCalls instead would drop it and
// break subsequent function-calling turns. Only messages built fresh by our
// own code (the user's own text/tool-response turns) go through part-mapping.
function messageToContent(msg: AiChatMessage): Content {
  if (msg.providerRaw) return msg.providerRaw as Content;

  const parts: Part[] = [];
  if (msg.text) parts.push({ text: msg.text });
  for (const call of msg.toolCalls ?? []) {
    parts.push({
      functionCall: {
        ...(call.id !== undefined ? { id: call.id } : {}),
        name: call.name,
        args: call.args,
      },
    });
  }
  for (const res of msg.toolResponses ?? []) {
    parts.push({
      functionResponse: {
        ...(res.id !== undefined ? { id: res.id } : {}),
        name: res.name,
        response: res.response,
      },
    });
  }
  return { role: msg.role, parts };
}

async function chatOnce(
  ai: GoogleGenAI,
  model: string,
  req: AiChatRequest,
): Promise<AiChatResult> {
  const response = await ai.models.generateContent({
    model,
    contents: req.messages.map(messageToContent),
    config: {
      ...(req.system ? { systemInstruction: req.system } : {}),
      maxOutputTokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.tools?.length
        ? {
            tools: [
              {
                functionDeclarations: req.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parametersJsonSchema: t.parameters,
                })),
              },
            ],
            toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
          }
        : {}),
    },
  });

  const toolCalls = response.functionCalls?.map((fc) => ({
    id: fc.id,
    name: fc.name ?? "",
    args: (fc.args ?? {}) as Record<string, unknown>,
  }));
  const text = response.text ?? undefined;
  if (!text && !toolCalls?.length) return { ok: false, error: "empty_response" };

  const usage = response.usageMetadata;
  return {
    ok: true,
    message: {
      role: "model",
      text,
      toolCalls,
      providerRaw: response.candidates?.[0]?.content,
    },
    model,
    usage: {
      promptTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens: usage?.totalTokenCount ?? 0,
    },
  };
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
    async chat(req) {
      const ai = getClient();
      if (!ai) return { ok: false, skipped: true };
      const model = DEFAULT_MODELS[req.tier];
      try {
        return await chatOnce(ai, model, req);
      } catch (err) {
        if (isRetryable(err)) {
          try {
            return await chatOnce(ai, model, req);
          } catch (retryErr) {
            console.error("[ai] Gemini chat retry failed:", retryErr);
            return { ok: false, error: "provider_error" };
          }
        }
        console.error("[ai] Gemini chat call failed:", err);
        return { ok: false, error: "provider_error" };
      }
    },
  };
}
