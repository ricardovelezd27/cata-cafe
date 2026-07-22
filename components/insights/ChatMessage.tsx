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
        <div className="max-w-[85%] bg-[#E8F0E8] text-brown-dark rounded-card px-4 py-2.5 text-sm whitespace-pre-wrap">
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
            ? "bg-[#FBF3F3] border-red-defect/30 text-red-defect"
            : "bg-white border-[#E8E0D0] text-brown-dark"
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
            className="flex items-center gap-1 text-xs font-semibold text-[#3D5A3E] hover:underline mt-2"
          >
            <RotateCcw size={12} />
            {t.retry}
          </button>
        )}

        {citations.length > 0 && (
          <div className="mt-3 pt-2 border-t border-[#E8E0D0] flex flex-col gap-0.5">
            {citations.map((line, i) => (
              <span key={i} className="text-[11px] text-brown-mid/70">
                {line}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
