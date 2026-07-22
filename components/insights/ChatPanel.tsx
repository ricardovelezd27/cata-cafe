"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send, Trash2 } from "lucide-react";
import { askDataQuestion } from "@/app/actions/aiChat";
import { ChatMessage } from "@/components/insights/ChatMessage";
import { useInsightsChatStore } from "@/stores/insightsChatStore";
import type { DimensionId, MeasureId } from "@/lib/analytics/types";

// Orchestrator for the "ask the data" chat: header (title/subtitle + usage
// counter + clear), scrollable message list with an empty state and example
// prompts, and the input row. State lives in the zustand store so it
// survives navigating between insights tabs within the same session.

export interface ChatTranslations {
  title: string;
  subtitle: string;
  placeholder: string;
  send: string;
  thinking: string;
  disclaimer: string;
  notConfigured: string;
  error: string;
  noAnswer: string;
  retry: string;
  // Raw ICU templates (see next-intl placeholder gotcha in project memory) —
  // interpolated locally with formatTemplate below since the values (limit,
  // remaining) are only known at runtime from the server action's response.
  limitReachedTemplate: string;
  remainingTemplate: string;
  emptyTitle: string;
  emptyHint: string;
  examples: string[];
  clear: string;
  you: string;
  assistant: string;
  benchmark: {
    mine: string;
    benchmark: string;
    n: string;
    avg: string;
    min: string;
    max: string;
    p25: string;
    p75: string;
  };
  origin: { year: string; production: string; myActivity: string };
  explorer: {
    dimensions: Record<DimensionId, string>;
    measures: Record<MeasureId, string>;
    tableCount: string;
    chartEmpty: string;
  };
  /** KPI field name (e.g. "coffeesRegistered") -> display label, for get_dashboard_overview chips. */
  overview: Record<string, string>;
}

interface ChatPanelProps {
  locale: string;
  t: ChatTranslations;
}

function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

const MAX_TEXTAREA_HEIGHT = 160;

export function ChatPanel({ locale, t }: ChatPanelProps) {
  const messages = useInsightsChatStore((s) => s.messages);
  const usage = useInsightsChatStore((s) => s.usage);
  const pending = useInsightsChatStore((s) => s.pending);
  const append = useInsightsChatStore((s) => s.append);
  const setUsage = useInsightsChatStore((s) => s.setUsage);
  const setPending = useInsightsChatStore((s) => s.setPending);
  const clear = useInsightsChatStore((s) => s.clear);

  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  async function handleSend(raw: string) {
    const question = raw.trim();
    if (!question || pending) return;

    // Build history as strict user/assistant PAIRS instead of just filtering
    // out error bubbles: `messages` always alternates user, assistant (the
    // assistant turn may be an error bubble), so a user message only belongs
    // in history when its immediate successor is a real (non-error)
    // assistant reply — a failed question with no successful answer is
    // dropped entirely, not left as a dangling/mid-history user turn. This
    // guarantees the array we send always alternates user/model and ends on
    // an assistant turn, so appending the new question server-side never
    // produces two adjacent role:"user" contents (which Gemini 400s on).
    const history: { role: "user" | "assistant"; text: string }[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role !== "user") continue;
      const next = messages[i + 1];
      if (next && next.role === "assistant" && !next.error) {
        history.push({ role: "user", text: m.text }, { role: "assistant", text: next.text });
      }
    }

    append({ id: crypto.randomUUID(), role: "user", text: question });
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setPending(true);

    try {
      const result = await askDataQuestion(history, question, locale);
      if ("usage" in result) setUsage(result.usage);

      if (result.ok) {
        append({
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.answer,
          blocks: result.blocks,
          citations: result.citations,
        });
      } else if ("error" in result) {
        if (result.error === "limit_reached") {
          // No bubble for this one — the persistent banner above the panel
          // already communicates it, driven by the `usage` state we just set.
        } else if (result.error === "no_answer") {
          append({ id: crypto.randomUUID(), role: "assistant", text: t.noAnswer, error: true });
        } else {
          append({ id: crypto.randomUUID(), role: "assistant", text: t.error, error: true });
        }
      } else {
        // { ok: false, skipped: true } — provider not configured.
        append({ id: crypto.randomUUID(), role: "assistant", text: t.notConfigured, error: true });
      }
    } catch {
      append({ id: crypto.randomUUID(), role: "assistant", text: t.error, error: true });
    } finally {
      setPending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend(input);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }

  const limitReached = usage != null && usage.remaining <= 0;
  const canSend = input.trim().length > 0 && !pending && !limitReached;

  return (
    <div className="flex flex-col gap-3 pb-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-serif text-xl text-green-dark">{t.title}</h2>
          <p className="text-sm text-brown-mid mt-0.5">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {usage && (
            <span className="text-xs text-brown-mid tabular-nums whitespace-nowrap">
              {formatTemplate(t.remainingTemplate, {
                remaining: usage.remaining,
                limit: usage.limit,
              })}
            </span>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clear}
              disabled={pending}
              className="flex items-center gap-1 text-xs text-brown-mid hover:text-red-defect disabled:opacity-50"
            >
              <Trash2 size={13} />
              {t.clear}
            </button>
          )}
        </div>
      </div>

      {usage && usage.remaining <= 0 && (
        <div className="rounded-card border border-amber-warm/40 bg-amber-warm/10 px-4 py-2.5 text-sm text-brown-dark">
          {formatTemplate(t.limitReachedTemplate, { limit: usage.limit })}
        </div>
      )}

      <div className="bg-white rounded-card border border-[#E8E0D0] shadow-card flex flex-col h-[60vh] min-h-[420px]">
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-6">
              <MessageCircle size={28} className="text-brown-mid/50" />
              <h3 className="text-sm font-semibold text-brown-dark">{t.emptyTitle}</h3>
              <p className="text-xs text-brown-mid max-w-sm">{t.emptyHint}</p>
              <div className="flex flex-col gap-2 w-full max-w-sm mt-1">
                {t.examples.map((example, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => void handleSend(example)}
                    className="rounded-pill border border-[#E8E0D0] bg-cream px-3 py-2 text-xs text-brown-dark hover:border-[#3D5A3E] hover:text-[#3D5A3E] transition-colors text-left"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, i) => {
              const retryText =
                message.error && message.role === "assistant"
                  ? messages
                      .slice(0, i)
                      .reverse()
                      .find((m) => m.role === "user")?.text
                  : undefined;
              return (
                <ChatMessage
                  key={message.id}
                  message={message}
                  locale={locale}
                  t={t}
                  onRetry={retryText ? () => void handleSend(retryText) : undefined}
                />
              );
            })
          )}

          {pending && (
            <div className="flex justify-start">
              <div className="bg-white rounded-card border border-[#E8E0D0] px-4 py-3 flex items-center gap-2 text-sm text-brown-mid">
                <Loader2 size={14} className="animate-spin" />
                {t.thinking}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[#E8E0D0] p-3 flex flex-col gap-1.5">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t.placeholder}
              disabled={pending || limitReached}
              rows={1}
              className="flex-1 resize-none rounded-input border border-[#D4C5A9] bg-white px-3 py-2 text-sm text-brown-dark focus:outline-none focus:border-green-dark disabled:opacity-60 disabled:bg-cream"
              style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
            />
            <button
              type="button"
              onClick={() => void handleSend(input)}
              disabled={!canSend}
              aria-label={t.send}
              className="shrink-0 rounded-pill bg-[#3D5A3E] text-white p-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-[11px] text-brown-mid/70">{t.disclaimer}</p>
        </div>
      </div>
    </div>
  );
}
