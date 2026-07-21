import "server-only";
import { createGeminiProvider } from "./gemini";
import type { AiProvider } from "./types";

// The provider seam: to switch to Claude (or any other provider), implement
// AiProvider in lib/ai/claude.ts and return it here.

let provider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (!provider) provider = createGeminiProvider();
  return provider;
}
