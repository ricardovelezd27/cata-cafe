"use client";

import { RotateCcw } from "lucide-react";
import { ChatBlock } from "@/components/insights/ChatBlock";
import { citationLines } from "@/lib/analytics/referenceSources";
import type { ReferenceSourceId } from "@/lib/analytics/referenceSources";
import type { ChatUiMessage } from "@/stores/insightsChatStore";
import type { ChatTranslations } from "@/components/insights/ChatPanel";

interface ChatMessageProps {
  message: ChatUiMessage;
  locale: string;
  t: ChatTranslations;
  onRetry?: () => void;
}

export function ChatMessage({ message, locale, t, onRetry }: ChatMessageProps) {
  const isUser = message.role === "user";
  const citations =
    !isUser && message.citations?.length
      ? citationLines(message.citations as ReferenceSourceId[], locale)
      : [];

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-primary-fixed/50 text-on-surface rounded-card px-4 py-2.5 text-sm whitespace-pre-wrap">
          <span className="sr-only">{t.you}: </span>
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[90%] rounded-card border px-4 py-3 text-sm ${
          message.error
            ? "bg-error-container border-error/30 text-error"
            : "bg-surface-container-lowest border-outline-variant text-on-surface"
        }`}
      >
        <span className="sr-only">{t.assistant}: </span>
        <div className="flex flex-col gap-2 leading-relaxed">
          {message.text
            .split(/\n+/)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((para, i) => (
              <p key={i}>{para}</p>
            ))}
        </div>

        {!message.error &&
          message.blocks?.map((block, i) => <ChatBlock key={i} block={block} t={t} />)}

        {onRetry && message.error && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1 text-xs font-semibold text-primary-container hover:underline mt-2"
          >
            <RotateCcw size={12} />
            {t.retry}
          </button>
        )}

        {citations.length > 0 && (
          <div className="mt-3 pt-2 border-t border-outline-variant flex flex-col gap-0.5">
            {citations.map((line, i) => (
              <span key={i} className="text-[11px] text-on-surface-variant/70">
                {line}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
