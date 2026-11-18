"use client";

import { createPollChain } from "@/lib/waitingPoll";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { subscribeWithSessionAuth } from "@/lib/supabase/realtimeAuth";
import { useForegroundResume } from "@/hooks/useForegroundResume";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, EyeOff } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { getWaitingState } from "@/app/actions/sessions";
import { isMissed, parseDbTimestamp, resyncPositionMs, runLengthMs, seekFor, skewMs, warmupSyncReducer, type SyncState } from "@/lib/warmup/syncedRun";
import { nextReferenceOrder } from "@/lib/referenceRules";
import { WARMUP_EXERCISES, WARMUP_SHARED, lw, warmupById, type WarmupExercise } from "@/lib/warmup/exercises";
import { hasSeenMoment, markMomentSeen, subscribeMoments } from "@/lib/sessionMoments";
import { START_EXIT_CAP_MS, exitMarksSeen, onCuppingStarted } from "@/lib/warmup/overlayGate";
import { previewSpec } from "@/lib/warmup/preview";
import { WarmupPlayer, type WarmupPlayerStrings } from "@/components/warmup/WarmupPlayer";
import { WarmupFigure } from "@/components/warmup/figures";
import { GatheringMark, StagePanel } from "@/components/arrival/StagePanel";
import { Button } from "@/components/ui";

export interface WaitingWarmupProps {
  /** CuppingSession.warmupExerciseId — the master's pick, or null. */
  chosenId: string | null;
  /** Synced run already in progress when the page loaded (ISO), or null. */
  warmupStartedAt: string | null;
  /** Server clock at render (ISO) — client skew = server − client. */
  serverNow: string;
  synced: {
    listen: string;
    stopped: string;
    soundToggle: string;
    missed: string;
    /** "En curso · paso {n} de {total}" (shown as its first words) */
    inProgress: string;
    join: string;
  };
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
    backToSessions: string;
    connectionLost: string;
  };
}) {
  const router = useRouter();
  // True whenever the realtime channel is not actively SUBSCRIBED — drives the
  // 15s polling fallback and the "connection lost" notice below.
  const [connectionLost, setConnectionLost] = useState(false);
  // Bumped on foreground resume so the realtime effect below re-runs (S8-15).
  const [resumeKey, setResumeKey] = useState(0);
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
  // "La cata empezó" while the player runs: the player leaves at the next
  // segment boundary or the cap, then we route.
  const [exitRequest, setExitRequest] = useState<{ deadlineMs: number; label: string; leavingIn: string } | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);
  // ── Synced run (the master pressed "Empezar con el grupo") ───────────
  const skewRef = useRef(0);
  useEffect(() => {
    const serverNow = parseDbTimestamp(warmup?.serverNow);
    skewRef.current = serverNow === null ? 0 : skewMs(serverNow, Date.now());
  }, [warmup?.serverNow]);
  const runMs = runLengthMs(chosen?.id);
  const [synced, setSynced] = useState<{ startedAtMs: number; seekMs: number } | null>(null);
  const [syncedMissed, setSyncedMissed] = useState(false);
  const [syncedNote, setSyncedNote] = useState<string | null>(null);
  const [syncedRunning, setSyncedRunning] = useState(false);
  const syncRef = useRef<SyncState>({ lastStartedAt: null });
  const syncedStartedAtMs = synced?.startedAtMs ?? null;
  const syncedResyncMs = useCallback(
    () => (syncedStartedAtMs === null ? null : resyncPositionMs(syncedStartedAtMs, Date.now(), skewRef.current)),
    [syncedStartedAtMs],
  );
  const openSynced = useCallback(
    (startedAtMs: number, live: boolean) => {
      if (!chosen || runMs <= 0) return;
      const now = Date.now();
      const skew = skewRef.current;
      if (isMissed(startedAtMs, now, skew, runMs)) {
        setSyncedMissed(true);
        setSyncedRunning(false);
        return;
      }
      setSyncedNote(null);
      setSyncedMissed(false);
      setSyncedRunning(true);
      setSynced({ startedAtMs, seekMs: seekFor(startedAtMs, now, skew, { live }) });
      setActiveWarmupId(chosen.id);
    },
    [chosen, runMs],
  );
  const applySyncRow = useCallback(
    (row: Record<string, unknown>, live: boolean) => {
      const r = warmupSyncReducer(syncRef.current, row);
      syncRef.current = r.state;
      if (r.action.type === "open") openSynced(r.action.startedAtMs, live);
      else if (r.action.type === "stopped") {
        setSynced(null);
        setSyncedRunning(false);
        setActiveWarmupId(null);
        setExitRequest(null);
        setSyncedNote(warmup?.synced.stopped ?? null);
      }
    },
    [openSynced, warmup?.synced.stopped],
  );
  const applySyncRef = useRef(applySyncRow);
  useEffect(() => {
    applySyncRef.current = applySyncRow;
  });
  // A run already in progress at page load (reload / late join): seek by the clocks.
  const initialSyncDone = useRef(false);
  useEffect(() => {
    if (initialSyncDone.current || !warmup?.warmupStartedAt) return;
    initialSyncDone.current = true;
    applySyncRef.current({ warmupStartedAt: warmup.warmupStartedAt }, false);
  }, [warmup?.warmupStartedAt]);
  const startedRef = useRef(false);
  const activeRef = useRef<string | null>(null);
  useEffect(() => {
    activeRef.current = activeWarmupId;
  }, [activeWarmupId]);

  const goToCup = useCallback(() => {
    router.push(`/${locale}/app/sessions/${sessionId}/cup`);
  }, [router, locale, sessionId]);

  const closePlayer = useCallback((markSeen: boolean) => {
    const id = activeRef.current;
    if (markSeen && id && chosen && id === chosen.id) {
      // Finishing, or skipping after 20 s of the run, counts (never nag
      // twice); an early stray skip leaves it unseen (S8-13 F-6).
      markMomentSeen("warmup", sessionId, userId, chosen.id);
    }
    setActiveWarmupId(null);
    setExitRequest(null);
    setSynced(null);
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

  // ONE foreground-resume path (S8-15 hook, S8-21 merge of S8-11's listeners):
  // a phone that slept has a dead socket and may have missed the start. Return
  // to the tab, bfcache pageshow and online all (a) recreate the channel via
  // resumeKey and (b) re-seed from the server right away through the same
  // refetch the SUBSCRIBED handler and the polling fallback use.
  const refetchRef = useRef<(() => Promise<void>) | null>(null);
  useForegroundResume(
    () => {
      if (isAsync) return;
      setResumeKey((k) => k + 1);
      void refetchRef.current?.();
    },
    { minHiddenMs: 0, pageshow: true },
  );

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

    // Fallback poll (S8-23 C-03: survives a rejected tick; see lib/waitingPoll).
    // refetchState stops it once the session started.
    const poll = createPollChain({ tick: () => refetchState() });
    const clearPoll = () => poll.stop();

    // One refetch, same handling as the live handler: started -> leave the
    // room; otherwise (re)apply the synced warm-up run. checkSessionStarted
    // stays boolean on purpose (service-worker-cached bundles call it).
    const refetchState = async () => {
      if (startedRef.current) return;
      const state = await getWaitingState(sessionId);
      if (!state) return;
      const serverNow = parseDbTimestamp(state.serverNow);
      if (serverNow !== null) skewRef.current = skewMs(serverNow, Date.now());
      if (state.startedAt) {
        clearPoll();
        onStartedRef.current();
        return;
      }
      applySyncRef.current({ warmupStartedAt: state.warmupStartedAt }, false);
    };

    refetchRef.current = refetchState;

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
              // Synced warm-up: edge-detected on warmupStartedAt (full-row payloads).
              applySyncRef.current(row, true);
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
          // Anything that happened while the socket was (re)connecting —
          // the start included — is only in the row, not in a missed event.
          void refetchState();
          return;
        }
        // Not (or no longer) subscribed — fall back to polling (15 s +/- 3 s)
        // so a dropped realtime connection never strands the waiting room.
        setConnectionLost(true);
        poll.start();
      },
    );

    return () => {
      refetchRef.current = null;
      clearPoll();
      stop();
    };
  }, [sessionId, router, isAsync, resumeKey]);

  const others = chosen ? WARMUP_EXERCISES.filter((ex) => ex.id !== chosen.id) : WARMUP_EXERCISES;

  return (
    // The app layout already renders the page's <main>: this is a plain box (it nested a second <main>).
    <div className="flex flex-1 justify-center px-4 py-6 lg:px-6 lg:py-8">
      <div className="flex w-full max-w-md flex-col gap-[16px]">
        {/* K-02: the stage behind the status only (StagePanel, the arrival stage's
            ground in a box); the actions and the warm-up card stay on paper. */}
        <StagePanel>
          <div className="flex flex-col items-center gap-[12px] text-center">
            <GatheringMark />
            <h1 className="page-title text-surface">{translations.title}</h1>
            <p className="text-card font-medium text-surface">{sessionName}</p>
            <p className="text-body leading-relaxed text-surface/80">{translations.description}</p>
            {isAsync && <p className="text-body leading-relaxed text-surface/80">{translations.asyncDetail}</p>}
            {referenceLine && (
              <p
                role="status"
                className="inline-block rounded-pill border border-surface/40 px-3 py-1 text-caption font-medium text-surface"
              >
                {referenceLine}
              </p>
            )}
            {/* Waiting: said in words, with one still mint mark. Nothing bounces. */}
            {!isAsync && (
              <p className="inline-flex items-center gap-2 text-caption text-surface/80">
                <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-primary-fixed" />
                {translations.waiting}
              </p>
            )}
            {!isAsync && connectionLost && (
              <p role="status" className="text-caption text-secondary-container">
                {translations.connectionLost}
              </p>
            )}
          </div>
        </StagePanel>

        {/* Only an async session has something to start here: it opens the cup page at
            once. A live session starts when the owner says so, and this page already
            follows that by itself (realtime + the polling fallback above), so a
            "start" button that only asked the server whether it had started was a
            button that did not do what it said (audit C-03). */}
        {isAsync && (
          <Button className="w-full" onClick={goToCup}>
            {translations.buttonLabel}
          </Button>
        )}

        <Link
          href={`/${locale}/app/sessions`}
          className="inline-flex min-h-[44px] items-center self-center text-caption text-on-surface-variant underline transition-colors hover:text-primary-container"
        >
          {translations.backToSessions}
        </Link>

        {warmup && (
          <section
            aria-label={warmup.title}
            className="rounded-card border border-outline-variant bg-surface-container-lowest p-5 text-left"
          >
            <p className="label-caps">
              {lw(WARMUP_SHARED.title, locale)}
            </p>
            {chosen ? (
              <HeroCard
                exercise={chosen}
                locale={locale}
                warmup={warmup}
                seen={chosenSeen}
                running={syncedRunning && !synced}
                note={syncedMissed ? warmup.synced.missed : syncedNote}
                onStart={() => setActiveWarmupId(chosen.id)}
                onJoin={() => {
                  const at = syncRef.current.lastStartedAt;
                  if (at !== null) openSynced(at, false);
                }}
              />
            ) : (
              <>
                <h2 className="section-title mt-1">{warmup.title}</h2>
                <p className="mt-1 text-body leading-relaxed text-on-surface-variant">{warmup.body}</p>
              </>
            )}

            {chosen ? (
              <div className="mt-4 border-t border-outline-variant pt-1">
                <button
                  type="button"
                  className="flex min-h-[44px] w-full items-center justify-between text-caption font-medium text-on-surface"
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
          mode={synced ? "synced" : "session"}
          seekToMs={synced?.seekMs}
          soundDefault={synced ? false : undefined}
          resyncPositionMs={synced ? syncedResyncMs : undefined}
          exitRequest={exitRequest}
          onFinish={() => closePlayer(true)}
          onExit={(info) => closePlayer(exitMarksSeen(info))}
        />
      )}
    </div>
  );
}

function HeroCard({
  exercise,
  locale,
  warmup,
  seen,
  running,
  note,
  onStart,
  onJoin,
}: {
  exercise: WarmupExercise;
  locale: string;
  warmup: WaitingWarmupProps;
  seen: boolean;
  /** The master's synced run is in progress and the player is closed here. */
  running: boolean;
  note: string | null;
  onStart: () => void;
  onJoin: () => void;
}) {
  const closedEyes = exercise.figureKind === "eyes";
  return (
    <div className="mt-2">
      <p className="label-caps">{warmup.hero}</p>
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
          <span className="block font-display text-card text-primary-container">{lw(exercise.name, locale)}</span>
          <span className="mt-1 block text-caption text-on-surface-variant tabular-nums">
            {warmup.minutes.replace("{min}", String(exercise.durationMin))} ·{" "}
            {lw(WARMUP_SHARED.posture[exercise.posture], locale)}
            {closedEyes ? ` · ${warmup.eyesClosed}` : ""}
          </span>
        </span>
      </div>
      {note && (
        <p role="status" className="mt-3 text-caption text-on-surface-variant">
          {note}
        </p>
      )}
      <div className="mt-4 flex items-center gap-3">
        {running && (
          <button
            type="button"
            onClick={onJoin}
            className="min-h-[44px] flex-1 rounded-pill bg-secondary px-5 text-caption font-medium text-on-secondary hover:opacity-90 sm:flex-none"
          >
            {warmup.synced.inProgress.split(" ·")[0]} · {warmup.synced.join}
          </button>
        )}
        <button
          type="button"
          onClick={onStart}
          className={
            seen
              ? "min-h-[44px] rounded-pill border border-outline-variant px-5 text-caption font-medium text-on-surface hover:bg-surface-container"
              : "min-h-[44px] flex-1 rounded-pill bg-primary-container px-5 text-caption font-medium text-on-primary hover:bg-primary sm:flex-none"
          }
        >
          {seen ? warmup.heroRepeat : warmup.heroStart}
        </button>
        {seen && (
          <span className="rounded-pill bg-primary-fixed px-3 py-1 text-caption font-semibold text-primary-container">
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
            <span className="min-w-0 flex-1 text-body font-medium text-on-surface">{lw(ex.name, locale)}</span>
            <span className="shrink-0 text-caption text-on-surface-variant tabular-nums">
              {minutes.replace("{min}", String(ex.durationMin))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
