"use server";

import { prisma } from "@/lib/prisma";
import { requireAiAdmin } from "@/lib/analytics/access";
import { getAiProvider } from "@/lib/ai";
import {
  DAILY_QUESTION_LIMIT,
  MAX_MODEL_CALLS,
  MAX_HISTORY_TURNS,
  TOOL_DEFS,
  buildChatSystem,
  executeTool,
} from "@/lib/ai/chatTools";
import type { AiChatBlock, AskDataResult, ChatHistoryItem } from "@/lib/ai/chatTypes";
import type { AiChatMessage, AiToolResponse } from "@/lib/ai/types";

// The "ask the data" chat agentic loop: alternates model calls with tool
// execution (run_insight / get_dashboard_overview / run_benchmark /
// get_origin_context) up to MAX_MODEL_CALLS times, then returns the model's
// final text answer plus the structured blocks each tool call produced.
// Daily question quota is tracked per user in AiChatUsage.

function asLocale(locale: string): "es" | "en" {
  return locale === "en" ? "en" : "es";
}

const MAX_TEXT_LENGTH = 2000;

function sanitizeHistory(history: unknown): ChatHistoryItem[] {
  if (!Array.isArray(history)) return [];
  const cleaned: ChatHistoryItem[] = [];
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const role = (item as Record<string, unknown>).role;
    const text = (item as Record<string, unknown>).text;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof text !== "string") continue;
    const trimmed = text.trim().slice(0, MAX_TEXT_LENGTH);
    if (!trimmed) continue;
    cleaned.push({ role, text: trimmed });
  }
  return cleaned.slice(-MAX_HISTORY_TURNS);
}

function toChatMessages(history: ChatHistoryItem[], question: string): AiChatMessage[] {
  const messages: AiChatMessage[] = history.map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    text: h.text,
  }));
  messages.push({ role: "user", text: question });
  return messages;
}

function blockCitations(block: AiChatBlock): string[] {
  if (block.tool === "run_benchmark" || block.tool === "get_origin_context") {
    return block.citations;
  }
  return [];
}

export async function askDataQuestion(
  history: ChatHistoryItem[],
  question: string,
  locale: string,
): Promise<AskDataResult> {
  const access = await requireAiAdmin();
  const loc = asLocale(locale);

  const day = new Date().toISOString().slice(0, 10);
  const usageRow = await prisma.aiChatUsage.findUnique({
    where: { userId_day: { userId: access.userId, day } },
  });
  const used = usageRow?.questionCount ?? 0;
  const limit = DAILY_QUESTION_LIMIT;

  if (used >= limit) {
    return { ok: false, error: "limit_reached", usage: { used, limit, remaining: 0 } };
  }

  const cleanHistory = sanitizeHistory(history);
  const trimmedQuestion = typeof question === "string" ? question.trim().slice(0, MAX_TEXT_LENGTH) : "";

  if (!trimmedQuestion) {
    return { ok: false, error: "no_answer", usage: { used, limit, remaining: limit - used } };
  }

  const messages = toChatMessages(cleanHistory, trimmedQuestion);

  const blocks: AiChatBlock[] = [];
  const citationSet = new Set<string>();
  let totalModelCalls = 0;
  let totalPromptTokens = 0;
  let totalOutputTokens = 0;
  let answer: string | null = null;
  let providerFailed = false;

  for (let i = 0; i < MAX_MODEL_CALLS; i++) {
    const lastTurn = i === MAX_MODEL_CALLS - 1;
    const res = await getAiProvider().chat({
      tier: "pro",
      system: buildChatSystem(loc),
      messages,
      tools: lastTurn ? undefined : TOOL_DEFS,
      maxOutputTokens: 1024,
      temperature: 0.4,
    });

    if (!res.ok) {
      if (res.skipped) {
        // Provider not configured — do not bill the question.
        return { ok: false, skipped: true };
      }
      providerFailed = true;
      break;
    }

    totalModelCalls += 1;
    totalPromptTokens += res.usage.promptTokens;
    totalOutputTokens += res.usage.outputTokens;
    messages.push(res.message);

    if (res.message.toolCalls?.length) {
      const toolResponses: AiToolResponse[] = [];
      for (const call of res.message.toolCalls) {
        try {
          const { block, toolResponse } = await executeTool(call.name, call.args, loc);
          blocks.push(block);
          for (const citation of blockCitations(block)) citationSet.add(citation);
          toolResponses.push({ ...toolResponse, id: call.id });
        } catch (err) {
          const message = err instanceof Error ? err.message : "tool_error";
          toolResponses.push({ id: call.id, name: call.name, response: { error: message } });
        }
      }
      messages.push({ role: "user", toolResponses });
      continue;
    }

    answer = res.message.text ?? null;
    break;
  }

  // Billing rule: the daily quota is only discounted if at least one model
  // API call actually succeeded (totalModelCalls > 0) — i.e. real cost was
  // incurred. A pure failure before any successful call (e.g. a bad model
  // name 404 on the very first call) must not cost the user a question, so
  // we skip the upsert entirely and return the usage numbers UN-incremented.
  // Once at least one call succeeded, bill exactly as before even if the
  // final outcome is a mid-loop provider_error or a no_answer — API cost was
  // actually incurred. (The `skipped`/no-API-key path already returned above.)
  if (totalModelCalls === 0) {
    return {
      ok: false,
      error: providerFailed ? "provider_error" : "no_answer",
      usage: { used, limit, remaining: limit - used },
    };
  }

  await prisma.aiChatUsage.upsert({
    where: { userId_day: { userId: access.userId, day } },
    create: {
      userId: access.userId,
      day,
      questionCount: 1,
      modelCalls: totalModelCalls,
      promptTokens: totalPromptTokens,
      outputTokens: totalOutputTokens,
    },
    update: {
      questionCount: { increment: 1 },
      modelCalls: { increment: totalModelCalls },
      promptTokens: { increment: totalPromptTokens },
      outputTokens: { increment: totalOutputTokens },
    },
  });

  const newUsed = used + 1;
  const remaining = Math.max(0, limit - newUsed);

  if (providerFailed) {
    return { ok: false, error: "provider_error", usage: { used: newUsed, limit, remaining } };
  }

  if (!answer) {
    return { ok: false, error: "no_answer", usage: { used: newUsed, limit, remaining } };
  }

  return {
    ok: true,
    answer,
    blocks,
    citations: [...citationSet],
    usage: { used: newUsed, limit, remaining },
  };
}
