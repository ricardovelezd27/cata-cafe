"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { subscribeWithSessionAuth } from "@/lib/supabase/realtimeAuth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, EyeOff } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { checkSessionStarted } from "@/app/actions/sessions";
import { nextReferenceOrder } from "@/lib/referenceRules";
import { WARMUP_EXERCISES, WARMUP_SHARED, lw, warmupById, type WarmupExercise } from "@/lib/warmup/exercises";
import { hasSeenMoment, markMomentSeen, subscribeMoments } from "@/lib/sessionMoments";
import { START_EXIT_CAP_MS, onCuppingStarted } from "@/lib/warmup/overlayGate";
import { previewSpec } from "@/lib/warmup/preview";
import { WarmupPlayer, type WarmupPlayerStrings } from "@/components/warmup/WarmupPlayer";
import { WarmupFigure } from "@/components/warmup/figures";

export interface WaitingWarmupProps {
  /** CuppingSession.warmupExerciseId — the master's pick, or null. */
  chosenId: string | null;
  title: string;
  body: string;
  /** "{min} min" */
  minutes: string;
  hero: string;
  heroStart: string;
  heroDone: string;
  heroRepeat: string;
  others: string;
  startedTitle: string;
  /** "Te llevamos en {time}" */
  leavingIn: string;
  eyesClosed: string;
  strings: WarmupPlayerStrings;
}

export function WaitingRoomClient({
  sessionId,
  sessionName,
  locale,
  userId,
  isAsync,
  samples,
  warmup,
  initialReferenceIds,
  translations,
}: {
  sessionId: string;
  sessionName: string;
  locale: string;
  userId: string;
  isAsync: boolean;
  samples: { id: string; label: string }[];
  /** "Mientras esperas" — Movimiento Sensorial card + inline player. */
  warmup?: WaitingWarmupProps;
  /** Ids of the references in rank order (R1 first); the last is the active one. */
  initialReferenceIds: string[];
  translations: {
    /** "Muestra de referencia: {label}" — raw ICU string, replaced here. */
    referenceLine: string;
    /** "Referencias: {list}" — raw ICU string, replaced here. */
    referencesLine: string;
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
  // The owner may pick/change the reference while people wait — same
  // cupping_sessions UPDATE stream that carries startedAt.
  const [refOrder, setRefOrder] = useState<string[]>(initialReferenceIds);
  const labelOf = (id: string) => samples.find((s) => s.id === id)?.label ?? "";
  const referenceLine = !refOrder.length
    ? null
    : refOrder.length === 1
      ? translations.referenceLine.replace("{label}", labelOf(refOrder[0]))
      : translations.referencesLine.replace(
          "{list}",
          refOrder.map((id, i) => `${labelOf(id)} (R${i + 1})`).join(" · "),
        );

  // ── Warm-up player (overlay INSIDE this tree so the startedAt handling
  // below keeps running while it is open) ──────────────────────────────
  const chosen = warmupById(warmup?.chosenId);
  const [activeWarmupId, setActiveWarmupId] = useState<string | null>(null);
  const activeWarmup = warmupById(activeWarmupId);
  // The chosen exercise, once done or skipped here, is "seen" for /cup too.
  const chosenSeen = useSyncExternalStore(
    subscribeMoments,
    () => (chosen ? hasSeenMoment("warmup", sessionId, userId, chosen.id) : false),
    () => false,
  );
  const [othersOpen, setOthersOpen] = useState(false);
  // "La cata empezó" while the player runs: the player leaves at the next
  // segment boundary or the cap, then we route.
  const [exitRequest, setExitRequest] = useState<{ deadlineMs: number; label: string; leavingIn: string } | null>(null);
  const startedRef = useRef(false);
  const activeRef = useRef<string | null>(null);
  useEffect(() => {
    activeRef.current = activeWarmupId;
  }, [activeWarmupId]);

  const goToCup = useCallback(() => {
    router.push(`/${locale}/app/sessions/${sessionId}/cup`);
  }, [router, locale, sessionId]);

  const closePlayer = useCallback(() => {
    const id = activeRef.current;
    if (id && chosen && id === chosen.id) {
      // Finishing OR skipping the master's pick counts (never nag twice).
      markMomentSeen("warmup", sessionId, userId, chosen.id);
    }
    setActiveWarmupId(null);
    setExitRequest(null);
    if (startedRef.current) goToCup();
  }, [chosen, sessionId, userId, goToCup]);

  // When the cupping starts: push at once unless the player is mid-run.
  const onStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (onCuppingStarted(activeRef.current ? "run" : "closed") === "push") {
      goToCup();
      return;
    }
    setExitRequest({
      deadlineMs: Date.now() + START_EXIT_CAP_MS,
      label: warmup?.startedTitle ?? "",
      leavingIn: warmup?.leavingIn ?? "{time}",
    });
  }, [goToCup, warmup?.startedTitle, warmup?.leavingIn]);
  const onStartedRef = useRef(onStarted);
  useEffect(() => {
    onStartedRef.current = onStarted;
  });

  // Back closes the player, not the page (push a history entry when it opens).
  useEffect(() => {
    if (!activeWarmupId) return;
    history.pushState({ warmupPlayer: true }, "");
    const onPop = () => {
      setActiveWarmupId(null);
      setExitRequest(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [activeWarmupId]);

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

    // JWT before join — see lib/supabase/realtimeAuth.ts (S6 CP-C4).
    const stop = subscribeWithSessionAuth(
      supabase,
      () =>
        supabase
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
              if ("referenceSampleId" in row || "reference_sample_id" in row) {
                const next = (row.referenceSampleId ?? row.reference_sample_id ?? null) as string | null;
                setRefOrder((prev) => nextReferenceOrder(prev, next));
              }
              // Columns are camelCase in Postgres; accept snake_case defensively.
              if (row.startedAt ?? row.started_at) {
                onStartedRef.current();
                return;
              }
              // Sample add/rename/remove touch the session row (S6 CP-C4): the
              // samples list and the reference line are server props here, so a
              // refresh is all it takes.
              router.refresh();
            },
          ),
      (status) => {
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
              onStartedRef.current();
            }
          }, 15000);
        }
      },
    );

    return () => {
      clearPoll();
      stop();
    };
  }, [sessionId, router, isAsync]);

  const handleStart = async () => {
    if (isAsync) {
      goToCup();
      return;
    }
    setChecking(true);
    const started = await checkSessionStarted(sessionId);
    setChecking(false);
    if (started) {
      onStarted();
    } else {
      setNotStarted(true);
      setTimeout(() => setNotStarted(false), 2000);
    }
  };

  const others = chosen ? WARMUP_EXERCISES.filter((ex) => ex.id !== chosen.id) : WARMUP_EXERCISES;

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
          {referenceLine && (
            <p
              role="status"
              className="inline-block rounded-pill bg-secondary-fixed px-3 py-1 text-sm font-medium text-secondary"
            >
              {referenceLine}
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

        {warmup && (
          <section
            aria-label={warmup.title}
            className="rounded-card border border-outline-variant bg-surface-container-lowest p-5 text-left"
          >
            <p className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
              {lw(WARMUP_SHARED.title, locale)}
            </p>
            {chosen ? (
              <HeroCard
                exercise={chosen}
                locale={locale}
                warmup={warmup}
                seen={chosenSeen}
                onStart={() => setActiveWarmupId(chosen.id)}
              />
            ) : (
              <>
                <h2 className="mt-1 font-display text-xl text-primary-container">{warmup.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">{warmup.body}</p>
              </>
            )}

            {chosen ? (
              <div className="mt-4 border-t border-outline-variant pt-1">
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between text-sm font-medium text-on-surface"
                  aria-expanded={othersOpen}
                  onClick={() => setOthersOpen((v) => !v)}
                >
                  <span>
                    {warmup.others} ({others.length})
                  </span>
                  <ChevronDown
                    size={18}
                    className={othersOpen ? "rotate-180 transition-transform" : "transition-transform"}
                    aria-hidden
                  />
                </button>
                {othersOpen && (
                  <ExerciseList exercises={others} locale={locale} minutes={warmup.minutes} onPick={setActiveWarmupId} />
                )}
              </div>
            ) : (
              <ExerciseList exercises={others} locale={locale} minutes={warmup.minutes} onPick={setActiveWarmupId} />
            )}
          </section>
        )}
      </div>

      {warmup && activeWarmup && (
        <WarmupPlayer
          key={activeWarmup.id}
          exercise={activeWarmup}
          locale={locale}
          t={warmup.strings}
          mode="session"
          exitRequest={exitRequest}
          onFinish={closePlayer}
          onExit={closePlayer}
        />
      )}
    </main>
  );
}

function HeroCard({
  exercise,
  locale,
  warmup,
  seen,
  onStart,
}: {
  exercise: WarmupExercise;
  locale: string;
  warmup: WaitingWarmupProps;
  seen: boolean;
  onStart: () => void;
}) {
  const closedEyes = exercise.figureKind === "eyes";
  return (
    <div className="mt-2">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">{warmup.hero}</p>
      <div className="mt-2 flex items-center gap-4">
        <span className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-card" aria-hidden>
          <WarmupFigure {...previewSpec(exercise)} frame="tile" />
          {closedEyes && (
            <span className="absolute bottom-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full bg-surface/80">
              <EyeOff size={12} />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-xl text-primary-container">{lw(exercise.name, locale)}</span>
          <span className="mt-1 block text-xs text-on-surface-variant tabular-nums">
            {warmup.minutes.replace("{min}", String(exercise.durationMin))} ·{" "}
            {lw(WARMUP_SHARED.posture[exercise.posture], locale)}
            {closedEyes ? ` · ${warmup.eyesClosed}` : ""}
          </span>
        </span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          className={
            seen
              ? "min-h-11 rounded-pill border border-outline-variant px-5 text-sm font-medium text-on-surface hover:bg-surface-container"
              : "min-h-11 flex-1 rounded-pill bg-primary-container px-5 text-sm font-medium text-on-primary hover:bg-primary sm:flex-none"
          }
        >
          {seen ? warmup.heroRepeat : warmup.heroStart}
        </button>
        {seen && (
          <span className="rounded-pill bg-primary-fixed px-3 py-1 text-xs font-semibold text-primary-container">
            {warmup.heroDone}
          </span>
        )}
      </div>
    </div>
  );
}

function ExerciseList({
  exercises,
  locale,
  minutes,
  onPick,
}: {
  exercises: readonly WarmupExercise[];
  locale: string;
  minutes: string;
  onPick: (id: string) => void;
}) {
  return (
    <ul className="mt-2 divide-y divide-outline-variant">
      {exercises.map((ex) => (
        <li key={ex.id}>
          <button
            type="button"
            onClick={() => onPick(ex.id)}
            className="flex min-h-14 w-full items-center gap-3 py-2 text-left transition-colors hover:text-primary-container"
          >
            <span className="h-12 w-12 shrink-0 overflow-hidden rounded-card" aria-hidden>
              <WarmupFigure {...previewSpec(ex)} frame="tile" />
            </span>
            <span className="min-w-0 flex-1 text-[15px] font-medium text-on-surface">{lw(ex.name, locale)}</span>
            <span className="shrink-0 text-xs text-on-surface-variant tabular-nums">
              {minutes.replace("{min}", String(ex.durationMin))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
