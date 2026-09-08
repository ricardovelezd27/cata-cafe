"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { checkSessionStarted } from "@/app/actions/sessions";

export function WaitingRoomClient({
  sessionId,
  sessionName,
  locale,
  isAsync,
  translations,
}: {
  sessionId: string;
  sessionName: string;
  locale: string;
  isAsync: boolean;
  translations: {
    title: string;
    description: string;
    asyncDetail: string;
    waiting: string;
    buttonLabel: string;
    checkingLabel: string;
    notStartedMsg: string;
    backToSessions: string;
    connectionLost: string;
  };
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [notStarted, setNotStarted] = useState(false);
  // True whenever the realtime channel is not actively SUBSCRIBED — drives the
  // 15s polling fallback and the "connection lost" notice below.
  const [connectionLost, setConnectionLost] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isAsync) return;

    const clearPoll = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const channel = supabase
      .channel(`waiting:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "cupping_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          // Columns are camelCase in Postgres; accept snake_case defensively.
          if (row.startedAt ?? row.started_at) {
            router.push(`/${locale}/app/sessions/${sessionId}/cup`);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnectionLost(false);
          clearPoll();
          return;
        }
        // Not (or no longer) subscribed — fall back to polling every 15s so a
        // dropped realtime connection never strands the waiting room.
        setConnectionLost(true);
        if (!pollRef.current) {
          pollRef.current = setInterval(async () => {
            const started = await checkSessionStarted(sessionId);
            if (started) {
              clearPoll();
              router.push(`/${locale}/app/sessions/${sessionId}/cup`);
            }
          }, 15000);
        }
      });

    return () => {
      clearPoll();
      supabase.removeChannel(channel);
    };
  }, [sessionId, locale, router, isAsync]);

  const handleStart = async () => {
    if (isAsync) {
      router.push(`/${locale}/app/sessions/${sessionId}/cup`);
      return;
    }
    setChecking(true);
    const started = await checkSessionStarted(sessionId);
    setChecking(false);
    if (started) {
      router.push(`/${locale}/app/sessions/${sessionId}/cup`);
    } else {
      setNotStarted(true);
      setTimeout(() => setNotStarted(false), 2000);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="text-6xl select-none" aria-hidden>
          ☕
        </div>

        <div className="space-y-3">
          <h1 className="font-serif text-3xl text-green-dark font-semibold">
            {translations.title}
          </h1>
          <p className="text-lg font-medium text-brown-dark">{sessionName}</p>
          <p className="text-sm text-brown-mid leading-relaxed">
            {translations.description}
          </p>
          {isAsync && (
            <p className="text-sm text-brown-mid leading-relaxed">
              {translations.asyncDetail}
            </p>
          )}
        </div>

        {!isAsync && (
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm text-brown-mid">{translations.waiting}</span>
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="inline-block w-1.5 h-1.5 rounded-full bg-green-dark/60 animate-bounce"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </span>
          </div>
        )}

        {!isAsync && connectionLost && (
          <p role="status" className="text-xs text-amber-warm">
            {translations.connectionLost}
          </p>
        )}

        <div className="space-y-2">
          <button
            onClick={handleStart}
            disabled={checking}
            className="w-full rounded-xl py-3 px-6 text-sm font-semibold text-white"
            style={{
              background: checking
                ? "#C4B49A"
                : "linear-gradient(135deg, #3D5A3E 0%, #2A4430 100%)",
              border: "none",
              cursor: checking ? "default" : "pointer",
              fontFamily: "inherit",
              transition: "background 0.2s",
            }}
          >
            {checking ? translations.checkingLabel : translations.buttonLabel}
          </button>
          {notStarted && (
            <p className="text-sm text-brown-mid">{translations.notStartedMsg}</p>
          )}
        </div>

        <Link
          href={`/${locale}/app/sessions`}
          className="inline-block text-sm text-brown-mid underline hover:text-green-dark transition-colors"
        >
          {translations.backToSessions}
        </Link>
      </div>
    </main>
  );
}
