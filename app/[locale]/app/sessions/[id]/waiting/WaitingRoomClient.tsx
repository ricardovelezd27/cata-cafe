"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { checkSessionStarted } from "@/app/actions/sessions";

export function WaitingRoomClient({
  sessionId,
  sessionName,
  locale,
  translations,
}: {
  sessionId: string;
  sessionName: string;
  locale: string;
  translations: {
    title: string;
    subtitle: string;
    description: string;
    waiting: string;
  };
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [notStarted, setNotStarted] = useState(false);

  useEffect(() => {
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
          if (row.started_at) {
            router.push(`/${locale}/app/sessions/${sessionId}/cup`);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, locale, router]);

  const handleCheckStart = async () => {
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
        {/* Coffee cup animation */}
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
        </div>

        {/* Animated dots */}
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

        {/* Manual refresh button */}
        <div className="space-y-2">
          <button
            onClick={handleCheckStart}
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
            {checking ? "Verificando..." : "Iniciar cata"}
          </button>
          {notStarted && (
            <p className="text-sm text-brown-mid">Aún no ha comenzado</p>
          )}
        </div>
      </div>
    </main>
  );
}
