import "server-only";
import { prisma } from "@/lib/prisma";
import { getAiProvider } from "./index";
import { narrativeHash, parseJsonContent } from "./narratives";
import type { AiGenerateRequest } from "./types";
import type { Prisma } from "@/app/generated/prisma/client";

// Cache-first AI generation shared by server actions, the report PDF route and
// the digest cron: identical inputs never re-bill the provider.

export type CachedAiResult<T> =
  | { ok: true; content: T; model: string; cached: boolean }
  | { ok: false; skipped?: boolean; error?: string };

export async function cachedGenerate<T>(
  kind: string,
  inputs: unknown,
  locale: string,
  request: AiGenerateRequest,
  force = false,
): Promise<CachedAiResult<T>> {
  const dataHash = narrativeHash(kind, inputs, locale);

  if (force) {
    await prisma.insightNarrative.deleteMany({ where: { kind, dataHash } });
  } else {
    const cached = await prisma.insightNarrative.findUnique({
      where: { kind_dataHash: { kind, dataHash } },
    });
    if (cached) {
      return { ok: true, content: cached.content as T, model: cached.model, cached: true };
    }
  }

  const result = await getAiProvider().generate(request);
  if (!result.ok) return result;

  const content = parseJsonContent<T>(result.text);
  if (!content) return { ok: false, error: "invalid_response" };

  // Upsert (not create) so a concurrent identical request can't violate the
  // unique constraint.
  await prisma.insightNarrative.upsert({
    where: { kind_dataHash: { kind, dataHash } },
    create: {
      kind,
      dataHash,
      locale,
      content: content as unknown as Prisma.InputJsonValue,
      model: result.model,
    },
    update: {
      content: content as unknown as Prisma.InputJsonValue,
      model: result.model,
    },
  });

  return { ok: true, content, model: result.model, cached: false };
}
