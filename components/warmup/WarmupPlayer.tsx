"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Armchair, ChevronDown, ChevronLeft, ChevronRight, Pause, Play, Settings2, ShieldCheck, Volume2, VolumeX, X } from "lucide-react";
import { WARMUP_SHARED, lw, type WarmupExercise } from "@/lib/warmup/exercises";
import { buildExerciseTimeline, exerciseForLength, poseInSegment, segmentAt, sequenceMap, stepSegments, timelineOpensEyes } from "@/lib/warmup/timeline";
import { ARRIVE_PLAN, ARRIVE_PLAN_SHORT, arrivePhaseAt, halo as haloAt } from "@/lib/warmup/breath";
import { partTransforms, passedDots, torsoBreathTransform } from "@/lib/warmup/poses";
import { previewSpec } from "@/lib/warmup/preview";
import { RESUME_WAIT_MS, audioResumeDecision } from "@/lib/warmup/audioResume";
import { shouldResync } from "@/lib/warmup/syncedRun";
import { skipNeedsConfirm, type WarmupExitInfo } from "@/lib/warmup/overlayGate";
import { REFLECTION_MAX } from "@/lib/warmup/reflections";
import type { NarrationSource, Pose, Segment, TimelineLength } from "@/lib/warmup/timelineTypes";
import { useRunClock } from "@/hooks/useRunClock";
import { useWarmupAudio } from "@/hooks/useWarmupAudio";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useLocalFlag } from "@/hooks/useLocalFlag";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { WarmupFigure } from "@/components/warmup/figures";
import { StepProgress } from "./StepProgress";
import { BreathField, type BreathFieldHandle } from "./BreathField";
import type { WarmupPlayerStrings } from "./playerStrings";
import s from "./WarmupPlayer.module.css";

export type { WarmupPlayerStrings } from "./playerStrings";

export type WarmupPlayerMode = "library" | "session" | "synced";

export interface WarmupPlayerProps {
  exercise: WarmupExercise;
  locale: string;
  t: WarmupPlayerStrings;
  /** library: intro → run → reflect → done. session: intro → run (+bridge) → onFinish.
   *  synced: like session, started by the host; the player opens seeked. */
  mode?: WarmupPlayerMode;
  /** Run length (S10 WP7, Kim F4/B7). "short" is 1-2 minutes with no reflect
   *  phase. The synced run ignores it (everyone follows the master's full
   *  timeline). With `lengthChoice` it is only the initial choice. */
  length?: TimelineLength;
  /** Show the "Completa / Corta" choice on the intro screen (library page). */
  lengthChoice?: boolean;
  /** Library mode: saves the two reflection answers (the host calls the server
   *  action and toasts a failure). Resolves true when saved. Absent = the
   *  reflect phase only shows the questions, as before. */
  onSaveReflection?: (answers: { feel: string; discovery: string }) => Promise<boolean>;
  /** Final screen's button / end of the bridge. */
  onFinish?: () => void;
  /** × "Saltar ejercicio" / "Cerrar" / Escape — the person leaves early. */
  onExit?: (info?: WarmupExitInfo) => void;
  /** md:+ only: render inside the page instead of fixed full-screen. */
  inline?: boolean;
  /** Synced run: skip the intro and start the clock at this elapsed ms. */
  seekToMs?: number;
  /** Synced followers: sound off until they opt in. */
  soundDefault?: boolean;
  /** "La cata empezó": show the docked bar, leave at the end of the leg or
   *  when `deadlineMs` (wall clock, Date.now()) passes. */
  exitRequest?: { deadlineMs: number; label: string; leavingIn: string } | null;
  /** Synced runs only: where the run SHOULD be now (ms from t0, server-skew
   *  adjusted), or null when unknown. Called when the page returns from the
   *  background; the player seeks only past RESYNC_DRIFT_MS. */
  resyncPositionMs?: () => number | null;
  className?: string;
}

type Phase = "intro" | "run" | "reflect" | "done";

const MOVING = new Set<Segment["kind"]>(["out", "back", "cross", "reps"]);
const fill = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), tpl);
const CHROME_HIDE_MS = 4000;
const subscribeNoop = () => () => {};

export function WarmupPlayer({
  exercise: exerciseProp,
  locale,
  t,
  mode = "library",
  length: lengthProp = "full",
  lengthChoice = false,
  onSaveReflection,
  onFinish,
  onExit,
  inline = false,
  seekToMs,
  soundDefault,
  exitRequest = null,
  resyncPositionMs,
  className,
}: WarmupPlayerProps) {
  const reducedMotion = useReducedMotion();
  const audio = useWarmupAudio(locale);
  const [accessible, setAccessible] = useLocalFlag("cata_warmup_numeral", false);
  const [largeText, setLargeText] = useLocalFlag("cata_warmup_largetext", false);
  const [still, setStill] = useLocalFlag("cata_warmup_still", false);
  const [seatedFlag, setSeatedFlag] = useLocalFlag("cata_warmup_seated", false);
  const [compactFlag, setCompactFlag] = useLocalFlag("cata_warmup_compact", false);
  const synced = mode === "synced";
  const sessionLike = mode !== "library";
  const [lengthChoiceState, setLengthChoiceState] = useState<TimelineLength>(lengthProp);
  // The synced run is always the full version, with neither option (everyone
  // follows the master's timeline).
  const length: TimelineLength = synced ? "full" : lengthChoiceState;
  const seated = !synced && seatedFlag && !!exerciseProp.seated;
  const compact = !synced && compactFlag;
  // The exercise as this length plays it (the short version keeps its first steps).
  const exercise = useMemo(() => exerciseForLength(exerciseProp, length), [exerciseProp, length]);
  const arrivePlan = length === "short" ? ARRIVE_PLAN_SHORT : ARRIVE_PLAN;

  const tl = useMemo(
    () => buildExerciseTimeline(exercise, { mode: sessionLike ? "session" : "library", length, compact }),
    [exercise, sessionLike, length, compact],
  );
  const steps = exercise.steps;
  const total = steps.length;
  const name = lw(exercise.name, locale);

  const [phase, setPhase] = useState<Phase>(seekToMs != null ? "run" : "intro");
  const [runKey, setRunKey] = useState(0);
  // Reflect phase (library mode, full version): the two optional answers.
  const [feel, setFeel] = useState("");
  const [discovery, setDiscovery] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  // ── Clock ─────────────────────────────────────────────────────────────
  const clock = useRunClock(tl.totalMs, {
    resetKey: `${exercise.id}:${runKey}:${phase === "run" ? "run" : "idle"}`,
    autoStart: phase === "run",
    pauseOnHide: !synced,
    onDone: () => {
      if (sessionLike) onFinish?.();
      else setPhase(length === "short" ? "done" : "reflect");
    },
  });
  const { elapsedMs, setStopAt: setClockStopAt, seek: clockSeek, runId } = clock;
  const running = phase === "run" && clock.running;
  const paused = phase === "run" && !clock.running && !clock.done;
  const wake = useWakeLock(phase === "run");

  // Initial seek for synced runs.
  const seekedRef = useRef(false);
  useEffect(() => {
    if (seekToMs == null || seekedRef.current) return;
    seekedRef.current = true;
    clockSeek(seekToMs, { play: true });
  }, [seekToMs, clockSeek]);

  // Sound default (synced followers start muted).
  const soundDefaultApplied = useRef(false);
  useEffect(() => {
    if (soundDefault === undefined || soundDefaultApplied.current) return;
    soundDefaultApplied.current = true;
    audio.setMuted(!soundDefault);
  }, [soundDefault, audio]);

  // ── Derived segment state (React updates only when the index changes) ──
  const [segIdx, setSegIdx] = useState(0);
  const seg = tl.segments[segIdx];
  const stepIdx = seg.stepIdx;
  const step = stepIdx >= 0 ? steps[stepIdx] : null;
  const stepSegs = useMemo(() => stepSegments(tl, segIdx), [tl, segIdx]);
  const moving = MOVING.has(seg.kind);
  const isArrive = seg.kind === "arrive";
  const isClosing = seg.kind === "closing";
  const isBridge = seg.kind === "bridge";
  const lastStepClosed = steps[total - 1]?.figure.variant === "slow-closed";
  const dusk = phase === "run" && ((step?.figure.variant === "slow-closed" && !(seg.kind === "read" && stepIdx === 0)) || (isClosing && lastStepClosed));
  const eyes: "open" | "closed" = step ? (step.figure.variant === "slow-closed" ? "closed" : "open") : lastStepClosed && isClosing ? "closed" : "open";

  // The leg whose trajectory the figure draws: the current movement, or for a
  // read / hold / lead-in the next (preview) / previous (reached) movement of
  // the same step.
  const pathSeg = useMemo<{ seg: Segment; reached: boolean } | null>(() => {
    if (stepIdx < 0) return null;
    if (moving && seg.kind !== "reps") return { seg, reached: false };
    const own = stepSegs.segments;
    const local = segIdx - stepSegs.first;
    const next = own.slice(local + 1).find((x) => MOVING.has(x.kind) && x.kind !== "reps");
    if (seg.kind === "read" || seg.kind === "lead-in" || (seg.kind === "hold" && !own.slice(0, local).some((x) => MOVING.has(x.kind)))) {
      return next ? { seg: next, reached: false } : null;
    }
    const prev = [...own.slice(0, local)].reverse().find((x) => MOVING.has(x.kind) && x.kind !== "reps");
    return prev ? { seg: prev, reached: true } : next ? { seg: next, reached: false } : null;
  }, [seg, segIdx, stepIdx, stepSegs, moving]);

  const [arriveLabel, setArriveLabel] = useState<{ phase: "rest" | "in" | "out"; text: string }>({ phase: "rest", text: "" });
  const [whisperIdx, setWhisperIdx] = useState<number | null>(null);
  const [secondaryIdx, setSecondaryIdx] = useState<number | null>(null);
  const [secLeft, setSecLeft] = useState<number | null>(null);
  const [chromeHidden, setChromeHidden] = useState(false);

  // ── DOM refs the loop writes to ───────────────────────────────────────
  const svgRef = useRef<SVGSVGElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<BreathFieldHandle>(null);
  /** Index of the next narration to speak (reset on every schedule). */
  const narrCursor = useRef(0);
  const lastWrite = useRef<Record<string, string>>({});
  const lastSegRef = useRef(segIdx);
  const lastFrameAt = useRef(0);
  const lastWindowAt = useRef(0);

  const paint = useCallback(
    (elapsed: number) => {
      const { i, u } = segmentAt(tl, elapsed);
      const sg = tl.segments[i];
      const local = elapsed - sg.t0Ms;
      const svg = svgRef.current;
      const bar = barRef.current;

      // Figure pose.
      if (svg && sg.kind !== "arrive") {
        const pose: Pose = reducedMotion ? (u >= 1 || !MOVING.has(sg.kind) ? sg.to : sg.from) : poseInSegment(sg, local, u);
        const tf = partTransforms(tl.kind, pose);
        for (const [part, value] of Object.entries(tf)) {
          if (lastWrite.current[part] === value) continue;
          lastWrite.current[part] = value;
          svg.querySelector<SVGGElement>(`[data-part="${part}"]`)?.setAttribute("transform", value);
        }
        if (sg.kind === "rest" && !reducedMotion && tl.kind !== "eyes") {
          svg.querySelector<SVGGElement>('[data-part="torso"]')?.setAttribute("transform", torsoBreathTransform(local));
        } else if (lastWrite.current.torso !== "") {
          lastWrite.current.torso = "";
          svg.querySelector<SVGGElement>('[data-part="torso"]')?.removeAttribute("transform");
        }
        // Trajectory dots behind the extremity.
        const dots = svg.querySelectorAll<SVGCircleElement>("[data-traj-dot]");
        if (dots.length) {
          const prog = MOVING.has(sg.kind) && sg.kind !== "reps" ? u : pathSeg?.reached ? 1 : 0;
          const n = passedDots(dots.length, prog);
          dots.forEach((d, k) => {
            const want = k < n ? "1" : null;
            if ((d.getAttribute("data-passed") ?? null) !== want) {
              if (want) d.setAttribute("data-passed", "1");
              else d.removeAttribute("data-passed");
            }
          });
          const dest = svg.querySelector("[data-traj-dest]");
          const reached = prog >= 1 ? "1" : null;
          if (dest && (dest.getAttribute("data-reached") ?? null) !== reached) {
            if (reached) dest.setAttribute("data-reached", "1");
            else dest.removeAttribute("data-reached");
          }
        }
      }

      // Bar: one fill for the whole run.
      if (bar) {
        const p = tl.totalMs > 0 ? Math.min(1, Math.max(0, elapsed / tl.totalMs)) : 0;
        bar.querySelector<HTMLElement>("[data-bar-fill]")?.style.setProperty("--p", p.toFixed(4));
        bar.querySelector<HTMLElement>("[data-halo]")?.style.setProperty("--p", p.toFixed(4));
      }

      // Breathing field (arrive).
      if (sg.kind === "arrive" && fieldRef.current) {
        const ap = arrivePhaseAt(elapsed, arrivePlan);
        if (ap.phase === "breath" && ap.breath) fieldRef.current.draw(ap.breath.scale, haloAt(elapsed - arrivePlan.postureMs), elapsed);
        else fieldRef.current.draw(0.62, 0.25, elapsed);
      }
      return { i, u, local, sg };
    },
    [tl, reducedMotion, pathSeg, arrivePlan],
  );

  // Segment-level reactions (edge-detected by the loop and by the layout paint).
  const onSegmentChange = useCallback(
    (prevIdx: number, nextIdx: number) => {
      const prev = tl.segments[prevIdx];
      const next = tl.segments[nextIdx];
      // Turn halo + lead glow.
      if (barRef.current && prev && MOVING.has(prev.kind)) {
        const h = barRef.current.querySelector<HTMLElement>("[data-halo]");
        if (h) {
          h.setAttribute("data-fire", "1");
          setTimeout(() => h.removeAttribute("data-fire"), 800);
        }
      }
      if (svgRef.current && MOVING.has(next.kind) && next.kind !== "reps") {
        const lead = svgRef.current.querySelector<SVGGElement>("[data-lead]");
        if (lead) {
          lead.setAttribute("data-glow", "1");
          setTimeout(() => lead.removeAttribute("data-glow"), 700);
        }
      }
      lastWrite.current = {};
      setSegIdx(nextIdx);
      setChromeHidden(false);
    },
    [tl],
  );

  // ── Voice: every segment is narrated (lib/warmup/timeline.ts narrations) ──
  // Resolved here because step texts live in the exercise and the rest in
  // the chrome strings. Read through a ref so the loop never re-subscribes.
  // The posture line of the arrival: the seated substitution (standing
  // exercise only) is applied here, so the text on screen and the voice agree.
  const postureLine = useMemo(() => {
    const base =
      exercise.posture === "standing"
        ? seated && exerciseProp.seated
          ? lw(exerciseProp.seated.arrivePosture, locale)
          : t.arrivePostureStanding
        : t.arrivePosture;
    // The "Poco espacio" line is on the intro screen only (text): a long
    // spoken arrival would push the short version's breath prompts late.
    // TODO(kim-validar:F5)
    return base;
  }, [exercise.posture, exerciseProp.seated, seated, locale, t.arrivePosture, t.arrivePostureStanding]);

  const narrationText = useCallback(
    (src: NarrationSource): string => {
      switch (src.kind) {
        case "step":
          return lw(steps[src.stepIdx].text, locale);
        case "label":
          return t.labels[src.label];
        case "chrome":
          return src.cue === "stop" ? t.cueStop : src.cue === "return" ? t.cueReturn : t.cueOtherSide;
        case "arrive":
          return src.phase === "notice" ? t.arriveNotice : postureLine;
        case "breath":
          return src.dir === "in" ? (src.first ? t.breathInFirst : t.breathIn) : src.first ? t.breathOutFirst : t.breathOut;
        case "closing":
          return t.closingStill;
        case "closingOpen":
          return t.closingOpen;
        case "bridge":
          return t.bridge;
      }
    },
    [steps, locale, t, postureLine],
  );
  const voiceOn = phase === "run" && audio.voice && audio.voiceAvailable && !synced;
  const narrateRef = useRef<(elapsed: number) => void>(() => {});
  useEffect(() => {
    narrateRef.current = (elapsed: number) => {
      const list = tl.narrations;
      while (narrCursor.current < list.length && list[narrCursor.current].atMs <= elapsed) {
        const n = list[narrCursor.current++];
        if (!voiceOn) continue;
        void audio.speak(narrationText(n.source), locale, { interrupt: n.interrupt });
      }
    };
  }, [tl, voiceOn, audio, narrationText, locale]);

  // ── The loop: runs only while the clock runs ──────────────────────────
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let cancelled = false;
    let lastRaf = performance.now();
    const frame = () => {
      if (cancelled) return;
      const nowMs = performance.now();
      lastRaf = nowMs;
      const elapsed = elapsedMs();
      const { i, u, local, sg } = (() => {
        const sgIdx = segmentAt(tl, elapsed);
        return { ...sgIdx, local: elapsed - tl.segments[sgIdx.i].t0Ms, sg: tl.segments[sgIdx.i] };
      })();
      if (i !== lastSegRef.current) {
        const prevIdx = lastSegRef.current;
        lastSegRef.current = i;
        onSegmentChange(prevIdx, i);
      }
      narrateRef.current(elapsed);
      const fastSeg = sg.kind === "reps" || sg.kind === "arrive";
      if (fastSeg || nowMs - lastFrameAt.current >= 33) {
        lastFrameAt.current = nowMs;
        paint(elapsed);
        void u;
        void local;
      }
      // Windows that do not align with segments (4 Hz is plenty).
      if (nowMs - lastWindowAt.current >= 250) {
        lastWindowAt.current = nowMs;
        const w = tl.whispers.find((x) => elapsed >= x.fromMs && elapsed < x.untilMs);
        setWhisperIdx((cur) => (cur === (w?.observeIdx ?? null) ? cur : (w?.observeIdx ?? null)));
        const st = tl.secondaryTexts.find((x) => elapsed >= x.fromMs && elapsed < x.untilMs);
        setSecondaryIdx((cur) => (cur === (st?.stepIdx ?? null) ? cur : (st?.stepIdx ?? null)));
        if (sg.kind === "arrive") {
          const ap = arrivePhaseAt(elapsed, arrivePlan);
          const next =
            ap.phase === "breath" && ap.breath
              ? ap.breath.phase === "in"
                ? { phase: "in" as const, text: ap.cycle === 0 ? t.breathInFirst : t.breathIn }
                : { phase: "out" as const, text: ap.cycle === 0 ? t.breathOutFirst : t.breathOut }
              : { phase: "rest" as const, text: "" };
          setArriveLabel((cur) => (cur.phase === next.phase && cur.text === next.text ? cur : next));
          if (ap.phase === "breath" && ap.breath?.phase === "in" && ap.breath.u < 0.05) audio.vibrate(10);
        }
        if (accessible || reducedMotion) {
          const left = Math.max(0, Math.ceil((sg.t0Ms + sg.durMs - elapsed) / 1000));
          setSecLeft((cur) => (cur === left ? cur : left));
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // rAF stops while the window is occluded (visibilityState stays
    // "visible"): a coarse interval keeps segment changes, cues and the
    // bar honest in that case; it yields to rAF whenever rAF is alive.
    const fallback = setInterval(() => {
      if (performance.now() - lastRaf > 400) {
        cancelAnimationFrame(raf);
        frame();
      }
    }, 250);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearInterval(fallback);
    };
  }, [running, elapsedMs, tl, paint, onSegmentChange, accessible, reducedMotion, t, audio, arrivePlan]);

  // Paint once on mount / segment change / pause / seek (StrictMode-safe).
  useLayoutEffect(() => {
    if (phase !== "run") return;
    const elapsed = elapsedMs();
    const { i } = segmentAt(tl, elapsed);
    if (i !== lastSegRef.current) {
      lastSegRef.current = i;
      setSegIdx(i);
      lastWrite.current = {};
      return;
    }
    lastWrite.current = {};
    paint(elapsed);
  }, [phase, segIdx, elapsedMs, runId, tl, paint]);

  // ── Audio schedule follows the clock ─────────────────────────────────
  useEffect(() => {
    if (running) {
      const elapsed = elapsedMs();
      audio.schedule(tl.cues, elapsed, tl.hums);
      // Lines at or just after the seek point play; earlier ones are skipped.
      narrCursor.current = tl.narrations.findIndex((n) => n.atMs >= elapsed - 50);
      if (narrCursor.current < 0) narrCursor.current = tl.narrations.length;
    } else {
      audio.cancel();
      audio.cancelSpeech();
    }
  }, [running, runId, audio, tl, elapsedMs]);
  useEffect(() => () => audio.cancel(), [audio]);

  // iOS "interrupted" → pause.
  useEffect(() => {
    if (audio.interrupted && running) clock.pause();
  }, [audio.interrupted, running, clock]);

  // ── Silent-after-lock guard (S8-13 F-3) ───────────────────────────────
  // After a lock / call the clock may resume while the AudioContext stays
  // suspended (resume() needs a gesture on iOS). On return we try to resume,
  // wait ~300 ms, and only if it is STILL not running (and the sound is on)
  // do we pause the run and ask for one tap. The tap is the gesture.
  const [resumePrompt, setResumePrompt] = useState(false);
  const showResumePrompt = resumePrompt && paused;
  // Any way of resuming (Space, Prev/Next, button) ends the prompt, so a later
  // ordinary pause never shows "Toca para reanudar" again. Adjusted during
  // render (React-sanctioned) rather than in an effect.
  if (resumePrompt && !paused) setResumePrompt(false);
  const guardRef = useRef({ muted: audio.muted, active: false, interrupted: audio.interrupted });
  useEffect(() => {
    guardRef.current = { muted: audio.muted, active: phase === "run" && !clock.userPaused && !clock.done, interrupted: audio.interrupted };
  }, [audio.muted, audio.interrupted, phase, clock.userPaused, clock.done]);
  const { checkContext } = audio;
  const clockPause = clock.pause;
  useEffect(() => {
    if (phase !== "run") return;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const ctxState = await checkContext(RESUME_WAIT_MS);
      if (cancelled) return;
      const g = guardRef.current;
      if (audioResumeDecision({ ctxState, muted: g.muted, running: g.active, interrupted: g.interrupted }) === "prompt") {
        clockPause();
        setResumePrompt(true);
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", check);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pageshow", check);
    };
  }, [phase, checkContext, clockPause]);
  // ── Synced follower: re-seek after the page was away (S8-13 F-2) ───────
  const resyncRef = useRef(resyncPositionMs);
  useEffect(() => {
    resyncRef.current = resyncPositionMs;
  }, [resyncPositionMs]);
  const clockSeekFn = clock.seek;
  const clockElapsed = clock.elapsedMs;
  useEffect(() => {
    if (!synced || phase !== "run") return;
    const back = () => {
      if (document.visibilityState !== "visible" || !guardRef.current.active) return;
      const target = resyncRef.current?.() ?? null;
      if (target !== null && shouldResync(clockElapsed(), target)) clockSeekFn(target, { play: true });
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("pageshow", back);
    };
  }, [synced, phase, clockElapsed, clockSeekFn]);

  const clockToggle = clock.toggle;
  // Play / pause through here: the click is the gesture that can wake audio.
  // A synced follower that was paused (resume prompt) rejoins the host's
  // position instead of continuing from where it stopped.
  const togglePlay = useCallback(() => {
    setResumePrompt(false);
    audio.unlock();
    const target = synced ? (resyncRef.current?.() ?? null) : null;
    if (target !== null && paused) clockSeekFn(target, { play: true });
    else clockToggle();
  }, [audio, clockToggle, clockSeekFn, synced, paused]);

  // ── Manual ("Quieto") mode: stop at the end of every step ─────────────
  const stopForQuieto = useCallback(
    (idx: number) => {
      if (!still || synced) return null;
      const sg = tl.segments[idx];
      if (sg.stepIdx >= 0) return tl.stepEnd[sg.stepIdx];
      if (sg.kind === "arrive") return tl.arriveMs;
      return null;
    },
    [still, synced, tl],
  );
  // Manual ("Quieto") mode: stop at the end of every step.
  useEffect(() => {
    if (phase !== "run") return;
    setClockStopAt(stopForQuieto(segIdx));
  }, [phase, segIdx, stopForQuieto, setClockStopAt]);

  // ── Navigation ────────────────────────────────────────────────────────
  const start = useCallback(() => {
    audio.unlock();
    setFeel("");
    setDiscovery("");
    setSavedNote(false);
    lastSegRef.current = 0;
    setSegIdx(0);
    setRunKey((k) => k + 1);
    setPhase("run");
  }, [audio]);

  const goNext = useCallback(() => {
    if (phase === "intro") return start();
    if (phase !== "run") return;
    const sg = tl.segments[segIdx];
    let target: number | null = null;
    if (sg.kind === "arrive") target = tl.stepStart[0];
    else if (sg.stepIdx >= 0) target = sg.stepIdx + 1 < total ? tl.stepStart[sg.stepIdx + 1] : tl.closingAt;
    else if (sg.kind === "closing") target = tl.bridgeAt ?? tl.totalMs;
    else target = tl.totalMs;
    if (target >= tl.totalMs) {
      clock.seek(tl.totalMs, { play: false });
      if (sessionLike) onFinish?.();
      else setPhase(length === "short" ? "done" : "reflect");
      return;
    }
    clock.seek(target, { play: true });
  }, [phase, start, tl, segIdx, total, clock, sessionLike, onFinish, length]);

  const goPrev = useCallback(() => {
    if (phase !== "run") return;
    const sg = tl.segments[segIdx];
    const elapsed = clock.elapsedMs();
    if (sg.kind === "arrive") {
      if (elapsed > 2000) clock.seek(0, { play: true });
      else if (!synced) {
        clock.pause();
        setPhase("intro");
      }
      return;
    }
    if (sg.stepIdx >= 0) {
      const startOf = tl.stepStart[sg.stepIdx];
      if (elapsed - startOf > 2000) clock.seek(startOf, { play: true });
      else clock.seek(sg.stepIdx > 0 ? tl.stepStart[sg.stepIdx - 1] : 0, { play: true });
      return;
    }
    clock.seek(sg.kind === "bridge" ? tl.closingAt : tl.stepStart[total - 1], { play: true });
  }, [phase, tl, segIdx, clock, synced, total]);

  // Leaving early (S8-13 F-6): the host decides what "seen" means from
  // `{ completed, elapsedMs }`. A skip that WOULD count as seen (past 20 s in
  // a session) asks for a second tap first; an early stray tap just leaves.
  const [confirmSkip, setConfirmSkip] = useState(false);
  useEffect(() => {
    if (!confirmSkip) return;
    const id = setTimeout(() => setConfirmSkip(false), 4000);
    return () => clearTimeout(id);
  }, [confirmSkip]);
  const exitInfo = useCallback(
    (): WarmupExitInfo => ({
      completed: phase === "reflect" || phase === "done" || clock.done,
      elapsedMs: phase === "run" ? clock.elapsedMs() : phase === "intro" ? 0 : tl.totalMs,
    }),
    [phase, clock, tl.totalMs],
  );
  const exit = useCallback(() => {
    const info = exitInfo();
    if (sessionLike && phase === "run" && skipNeedsConfirm(info) && !confirmSkip) {
      setConfirmSkip(true);
      return;
    }
    audio.cancel();
    audio.cancelSpeech();
    onExit?.(info);
  }, [audio, onExit, exitInfo, sessionLike, phase, confirmSkip]);

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      const onInteractive = !!target?.closest?.('button, a[href], [role="button"], [role="switch"], summary, [tabindex]:not([tabindex="-1"])');
      if (onInteractive && (e.key === " " || e.key === "Enter")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (phase !== "reflect") goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === " " && phase === "run") {
        e.preventDefault();
        clock.toggle();
      } else if (e.key === "Escape" && onExit) {
        // The session overlay also listens on window: this handler was
        // registered first (child effects run first), so stop the rest.
        e.stopImmediatePropagation();
        exit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, clock, phase, onExit, exit]);

  // ── Chrome auto-hide during slow legs ─────────────────────────────────
  const slowLeg = phase === "run" && !paused && !exitRequest && stepIdx >= 0 && step?.figure.variant !== "fast-open" && (moving || seg.kind === "hold");
  const [chromeEpoch, setChromeEpoch] = useState(0);
  const revealChrome = useCallback(() => {
    setChromeHidden(false);
    setChromeEpoch((n) => n + 1);
  }, []);
  // Eyes-closed (dusk) legs hide the footer, so the first tap on the stage
  // is a PAUSE (short haptic + the footer and "Pausado" come back), not just
  // a reveal. Taps on real controls are left to the controls.
  const clockPauseNow = clock.pause;
  const onRootPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (dusk && chromeHidden && running && !(e.target as HTMLElement).closest?.("button, a, input, textarea, select")) {
        clockPauseNow();
        audio.vibrate(30);
      }
      revealChrome();
    },
    [dusk, chromeHidden, running, clockPauseNow, audio, revealChrome],
  );
  useEffect(() => {
    if (!slowLeg) return;
    const id = setTimeout(() => setChromeHidden(true), CHROME_HIDE_MS);
    return () => clearTimeout(id);
  }, [slowLeg, segIdx, chromeEpoch]);
  useEffect(() => {
    if (slowLeg) return;
    const id = setTimeout(() => setChromeHidden(false), 0);
    return () => clearTimeout(id);
  }, [slowLeg]);

  // ── "La cata empezó" exit request ─────────────────────────────────────
  const exitFiredRef = useRef(false);
  useEffect(() => {
    if (!exitRequest || exitFiredRef.current) return;
    if (phase !== "run") {
      exitFiredRef.current = true;
      onFinish?.();
      return;
    }
    const leave = () => {
      if (exitFiredRef.current) return;
      exitFiredRef.current = true;
      onFinish?.();
    };
    // Leave at the end of the current leg (next segment change) or at the deadline.
    const wait = Math.max(0, exitRequest.deadlineMs - Date.now());
    const deadline = setTimeout(leave, wait);
    const off = clock.subscribe((e) => {
      if (e === "done") leave();
    });
    return () => {
      clearTimeout(deadline);
      off();
    };
  }, [exitRequest, phase, clock, onFinish]);
  const exitSegRef = useRef<number | null>(null);
  useEffect(() => {
    if (!exitRequest) {
      exitSegRef.current = null;
      return;
    }
    // Leave at the end of whatever segment was running when the request
    // arrived (a leg, a hold, a read beat): the next boundary is the natural
    // exit; the deadline above caps it.
    if (exitSegRef.current === null) exitSegRef.current = segIdx;
    else if (segIdx !== exitSegRef.current && !exitFiredRef.current) {
      exitFiredRef.current = true;
      onFinish?.();
    }
  }, [exitRequest, segIdx, onFinish]);
  const [exitNow, setExitNow] = useState(0);
  useEffect(() => {
    if (!exitRequest) return;
    const tickNow = () => setExitNow(Date.now());
    const first = setTimeout(tickNow, 0);
    const id = setInterval(tickNow, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [exitRequest]);
  const exitLeft = exitRequest && exitNow ? Math.max(0, Math.ceil((exitRequest.deadlineMs - exitNow) / 1000)) : null;

  // ── Text ──────────────────────────────────────────────────────────────
  const labels = t.labels;
  const stepText = step ? lw(step.text, locale) : "";
  const cueText = isArrive
    ? arrivePhaseAt(clock.elapsedMs(), arrivePlan).phase === "posture"
      ? postureLine
      : arrivePhaseAt(clock.elapsedMs(), arrivePlan).phase === "notice"
        ? t.arriveNotice
        : "" // the bubble carries "Toma aire / Suelta"
    : isClosing
      ? t.closingStill
      : isBridge
        ? t.bridge
        : stepText;
  const chromeCue =
    seg.chromeCue === "stop" ? t.cueStop : seg.chromeCue === "return" ? t.cueReturn : seg.chromeCue === "otherSide" ? t.cueOtherSide : "";
  const whisper = whisperIdx !== null ? lw(exercise.observe[whisperIdx], locale) : "";
  const secondary = secondaryIdx !== null ? lw(steps[secondaryIdx].text, locale) : "";
  const breathHint = seg.kind === "read" && tl.breathHintStepIdx === stepIdx ? t.breathOnItsOwn : "";
  const eyebrow =
    phase === "intro"
      ? lw(WARMUP_SHARED.title, locale)
      : isArrive
        ? t.arriveEyebrow
        : isClosing
          ? t.closingTitle
          : isBridge
            ? labels.bridge
            : step
              ? fill(t.stepOf, { n: stepIdx + 1, total })
              : phase === "reflect"
                ? t.reflectEyebrow
                : t.doneTitle;
  const liveCue = phase === "run" ? [chromeCue, cueText].filter(Boolean).join(" ") : "";
  const barLabel = paused ? t.paused : undefined;
  const evolution = useMemo(
    () => (["fast-open", "slow-open", "slow-closed"] as const).map((v) => lw(WARMUP_SHARED.evolution.stages[v], locale)),
    [locale],
  );
  const sequence = useMemo(() => sequenceMap(exercise, locale, labels), [exercise, locale, labels]);
  const preview = useMemo(() => previewSpec(exercise), [exercise]);

  const repeat = () => setPhase("intro");

  const figurePath = pathSeg ? { from: pathSeg.seg.from, to: pathSeg.seg.to, progress: pathSeg.reached ? 1 : 0 } : null;
  // Eyes-closed dusk darkens the WHOLE screen, not just the player: on
  // desktop the inline player sits inside the app shell, so a fixed veil is
  // portalled to <body> under the player (which rises above it in dusk).
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const veilHost = mounted ? document.body : null;
  const showFigure = phase === "run" ? !isArrive && !isBridge : true;
  const stageDim = phase !== "run" || isClosing;

  return (
    <section
      className={[s.root, inline ? s.inline : "", largeText ? s.large : "", className ?? ""].join(" ")}
      aria-label={name}
      data-phase={phase}
      data-dusk={dusk ? "1" : undefined}
      data-chrome-hidden={chromeHidden ? "1" : undefined}
      data-mode={mode}
      onPointerDown={onRootPointerDown}
      onPointerMove={chromeHidden ? revealChrome : undefined}
    >
      {/* ── Top bar: the single exit, never hides ── */}
      <header className={s.topbar}>
        {onExit ? (
          <button
            type="button"
            className={s.exitBtn}
            onClick={exit}
            aria-label={confirmSkip ? t.skipConfirm : sessionLike ? t.skipExercise : t.close}
          >
            <X size={20} aria-hidden />
            {sessionLike && <span>{confirmSkip ? t.skipConfirm : t.skipExercise}</span>}
          </button>
        ) : (
          <span />
        )}
        <p className={s.eyebrow}>{eyebrow}</p>
        <button
          type="button"
          className={s.iconGhost}
          onClick={() => {
            audio.unlock();
            audio.setMuted(!audio.muted);
          }}
          aria-label={audio.muted ? t.unmuteLabel : t.muteLabel}
          aria-pressed={audio.muted}
        >
          {audio.muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
        </button>
      </header>

      {/* ── Stage ── */}
      <div className={[s.stage, stageDim ? s.stageDim : ""].join(" ")}>
        {phase === "run" && isArrive && (
          <BreathField ref={fieldRef} phase={arriveLabel.phase} label={arriveLabel.text} dusk={dusk} reduced={reducedMotion} />
        )}
        {showFigure && (
          <div className={[s.figureBox, isClosing ? s.figureQuiet : ""].join(" ")}>
            {phase === "run" ? (
              <WarmupFigure
                ref={svgRef}
                kind={tl.kind}
                eyes={eyes}
                lead={step?.figure.lead}
                highlight={moving || seg.kind === "hold" || seg.kind === "read" || seg.kind === "lead-in"}
                path={figurePath}
                frame="stage"
                title={stepText || name}
              />
            ) : (
              <WarmupFigure {...preview} frame="stage" title={name} />
            )}
          </div>
        )}
      </div>

      {/* ── Progress ── */}
      {phase === "run" && (
        <StepProgress
          ref={barRef}
          label={isArrive ? t.arriveEyebrow : labels[seg.label]}
          holdLabel={barLabel}
          paused={paused}
          seconds={accessible || reducedMotion ? secLeft : null}
          dusk={dusk}
        />
      )}

      {/* ── Body ── */}
      <div className={[s.body, phase === "run" ? s.bodyRun : ""].join(" ")}>
        {phase === "intro" && (
          <IntroScreen
            exercise={exercise}
            seatedTexts={exerciseProp.seated ?? null}
            lengthChoice={lengthChoice && !synced}
            length={length}
            opensEyes={timelineOpensEyes(tl)}
            setLength={setLengthChoiceState}
            fullMinutes={exerciseProp.durationMin}
            seated={seated}
            setSeated={setSeatedFlag}
            compact={compact}
            setCompact={setCompactFlag}
            locale={locale}
            t={t}
            evolution={evolution}
            sequence={sequence}
            total={total}
            audio={audio}
            accessible={accessible}
            setAccessible={setAccessible}
            largeText={largeText}
            setLargeText={setLargeText}
            still={still}
            setStill={setStill}
            reducedMotion={reducedMotion}
            wakeDenied={wake.denied}
          />
        )}

        {phase === "run" && (
          <>
            {/* Keyed by TEXT, not segment: the line only fades when it changes,
                so a read → hold → leg chain never re-animates the same words. */}
            <p key={`cue:${cueText}`} className={[s.cue, moving && dusk ? s.cueMoving : "", s.fadeIn].join(" ")}>
              {cueText}
            </p>
            {chromeCue && !paused && (
              <p key={`${segIdx}-chrome`} className={s.chromeCue}>
                {chromeCue}
              </p>
            )}
            <p className={s.whisperSlot} aria-live="polite">
              {secondary ? (
                <span key={`sec-${secondaryIdx}`} className={s.secondary}>
                  {secondary}
                </span>
              ) : breathHint ? (
                <span key="breath" className={s.whisper}>
                  {breathHint}
                </span>
              ) : whisper ? (
                <span key={`w-${whisperIdx}`} className={s.whisper}>
                  {whisper}
                </span>
              ) : null}
            </p>
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {liveCue}
            </p>
            {synced && wake.denied && <p className={[s.muted, s.note].join(" ")}>{t.wakeLockNote}</p>}
            {showResumePrompt && (
              <button type="button" className={s.primaryBtn} onClick={togglePlay}>
                {t.tapToResume}
              </button>
            )}
            {isBridge && (
              <button type="button" className={s.primaryBtn} onClick={onFinish ?? exit}>
                {t.goToTable}
              </button>
            )}
          </>
        )}

        {phase === "reflect" && (
          <form
            className={s.reflect}
            onSubmit={async (e) => {
              e.preventDefault();
              if (saving) return;
              const hasText = feel.trim() !== "" || discovery.trim() !== "";
              if (!onSaveReflection || !hasText) {
                setPhase("done");
                return;
              }
              setSaving(true);
              let ok = false;
              try {
                ok = await onSaveReflection({ feel: feel.trim(), discovery: discovery.trim() });
              } finally {
                setSaving(false);
              }
              // A failed save keeps the text on screen (the host toasts why).
              if (ok) {
                setSavedNote(true);
                setPhase("done");
              }
            }}
          >
            <h2 className={s.title}>{t.reflectTitle}</h2>
            <p className={s.muted}>{onSaveReflection ? t.reflectLead : t.reflectLeadNoSave}</p>
            {exercise.closing.map((q, i) => (
              <div key={i} className={s.field}>
                {onSaveReflection ? (
                  <label className={s.question} htmlFor={`wu-reflect-${i}`}>
                    {lw(q, locale)}
                  </label>
                ) : (
                  <p className={s.question}>{lw(q, locale)}</p>
                )}
                {onSaveReflection && (
                  <textarea
                    id={`wu-reflect-${i}`}
                    className={s.textarea}
                    rows={3}
                    maxLength={REFLECTION_MAX}
                    value={i === 0 ? feel : discovery}
                    onChange={(e) => (i === 0 ? setFeel(e.target.value) : setDiscovery(e.target.value))}
                    disabled={saving}
                  />
                )}
              </div>
            ))}
            {onSaveReflection && <p className={s.muted}>{t.reflectPrivate}</p>}
            <div className={s.reflectActions}>
              {onSaveReflection ? (
                <>
                  <button type="button" className={s.ghostBtn} onClick={() => setPhase("done")} disabled={saving}>
                    {t.reflectSkip}
                  </button>
                  <button type="submit" className={s.primaryBtn} disabled={saving}>
                    {saving ? t.reflectSaving : t.reflectSave}
                  </button>
                </>
              ) : (
                <button type="submit" className={s.primaryBtn}>
                  {t.reflectContinue}
                </button>
              )}
            </div>
          </form>
        )}

        {phase === "done" && (
          <>
            <h2 className={s.title}>{t.doneTitle}</h2>
            <p className={s.lead}>{t.doneBody}</p>
            {savedNote && <p className={s.muted}>{t.reflectSaved}</p>}
            {tl.doneObserveIdx.length > 0 && (
              <>
                <p className={s.kicker}>{t.noticedTitle}</p>
                <ul className={s.list}>
                  {tl.doneObserveIdx.map((i) => (
                    <li key={i}>{lw(exercise.observe[i], locale)}</li>
                  ))}
                </ul>
              </>
            )}
            <div className={s.reflectActions}>
              <button type="button" className={s.ghostBtn} onClick={repeat}>
                {t.repeat}
              </button>
              <button type="button" className={s.primaryBtn} onClick={() => (onFinish ? onFinish() : onExit?.({ completed: true, elapsedMs: tl.totalMs }))}>
                {onFinish ? t.backToList : t.finish}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Footer controls ── */}
      {phase === "intro" && (
        <footer className={s.controls}>
          <button type="button" className={[s.primaryBtn, s.startBtn].join(" ")} onClick={start}>
            {t.start}
            <ChevronRight size={16} aria-hidden />
          </button>
        </footer>
      )}
      {phase === "run" && !isBridge && (
        <footer className={s.controls}>
          <button type="button" className={s.chevBtn} onClick={goPrev} aria-label={t.prev} disabled={synced && isArrive}>
            <ChevronLeft size={22} aria-hidden />
          </button>
          <button
            type="button"
            className={s.playBtn}
            onClick={togglePlay}
            aria-label={paused ? t.resume : t.pause}
            aria-pressed={paused}
          >
            {paused ? <Play size={24} aria-hidden /> : <Pause size={24} aria-hidden />}
          </button>
          <button type="button" className={s.chevBtn} onClick={goNext} aria-label={t.next}>
            <ChevronRight size={22} aria-hidden />
          </button>
        </footer>
      )}

      {veilHost && createPortal(<div className={s.duskVeil} data-on={dusk ? "1" : undefined} aria-hidden />, veilHost)}

      {/* ── "La cata empezó" docked bar ── */}
      {exitRequest && phase === "run" && (
        <div className={s.exitBar} role="status" aria-live="polite">
          <span className={s.exitDot} aria-hidden />
          <span className={s.exitText}>
            <span className={s.exitTitle}>{exitRequest.label}</span>
            {exitLeft !== null && <span className={s.exitSub}>{fill(exitRequest.leavingIn, { time: `0:${String(exitLeft).padStart(2, "0")}` })}</span>}
          </span>
          <button type="button" className={s.exitGo} onClick={onFinish ?? exit}>
            {t.goToTable} →
          </button>
        </div>
      )}
    </section>
  );
}

// ── Intro ────────────────────────────────────────────────────────────────

function IntroScreen({
  exercise,
  seatedTexts,
  lengthChoice,
  length,
  opensEyes,
  setLength,
  fullMinutes,
  seated,
  setSeated,
  compact,
  setCompact,
  locale,
  t,
  evolution,
  sequence,
  total,
  audio,
  accessible,
  setAccessible,
  largeText,
  setLargeText,
  still,
  setStill,
  reducedMotion,
  wakeDenied,
}: {
  exercise: WarmupExercise;
  seatedTexts: WarmupExercise["seated"] | null;
  lengthChoice: boolean;
  length: TimelineLength;
  /** The chosen run plays the "doble" (derived from the timeline's cues). */
  opensEyes: boolean;
  setLength: (l: TimelineLength) => void;
  fullMinutes: number;
  seated: boolean;
  setSeated: (v: boolean) => void;
  compact: boolean;
  setCompact: (v: boolean) => void;
  locale: string;
  t: WarmupPlayerStrings;
  evolution: string[];
  sequence: string[];
  total: number;
  audio: ReturnType<typeof useWarmupAudio>;
  accessible: boolean;
  setAccessible: (v: boolean) => void;
  largeText: boolean;
  setLargeText: (v: boolean) => void;
  still: boolean;
  setStill: (v: boolean) => void;
  reducedMotion: boolean;
  wakeDenied: boolean;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className={s.intro}>
      <header className={s.introHead}>
        <div className={s.pills} aria-hidden>
          <span className={s.pill}>{length === "short" ? t.shortMinutes : fill(t.minutes, { min: fullMinutes })}</span>
          <span className={s.pill}>{fill(t.stepsCount, { count: total })}</span>
          <span className={s.pill}>{lw(seated ? WARMUP_SHARED.posture.seated : WARMUP_SHARED.posture[exercise.posture], locale)}</span>
        </div>
        <h1 className={s.title}>{lw(exercise.name, locale)}</h1>
        <p className={s.lead}>{lw(exercise.purpose, locale)}</p>
      </header>

      {/* The route in one glance: numbered beads, one per step. */}
      <section aria-label={t.sequenceLabel}>
        <p className={s.kicker}>{t.sequenceLabel}</p>
        <ol className={s.seq}>
          {sequence.map((label, i) => (
            <li key={`${i}-${label}`} className={s.seqItem}>
              <span className={s.seqDot}>{i + 1}</span>
              <span className={s.seqLabel}>{label}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className={s.cards}>
        <section className={s.card}>
          <Armchair size={18} className={s.cardIcon} aria-hidden />
          <div>
            <p className={s.cardTitle}>{t.postureLabel}</p>
            <p className={s.cardBody}>{lw(seated && seatedTexts ? seatedTexts.postureText : exercise.postureText, locale)}</p>
          </div>
        </section>
        <section className={[s.card, s.cardSafety].join(" ")}>
          <ShieldCheck size={18} className={s.cardIcon} aria-hidden />
          <div>
            <p className={s.cardTitle}>{lw(WARMUP_SHARED.safety.title, locale)}</p>
            <p className={s.cardBody}>{lw(WARMUP_SHARED.safety.text, locale)}</p>
          </div>
        </section>
      </div>

      {/* Run length (library page): full or the 1-2 minute version. */}
      {lengthChoice && (
        <section aria-label={t.lengthLabel}>
          <p className={s.kicker}>{t.lengthLabel}</p>
          <div className={s.segRow} role="radiogroup" aria-label={t.lengthLabel}>
            {(["full", "short"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={length === l}
                className={[s.seg, length === l ? s.segOn : ""].join(" ")}
                onClick={() => setLength(l)}
              >
                {l === "full" ? fill(t.lengthFull, { min: fullMinutes }) : t.lengthShort}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Two optional substitutions (S10 WP7, Kim F5), both off by default and
          remembered on this device. Same timing, same choreography. */}
      <section aria-label={t.adaptLabel}>
        <p className={s.kicker}>{t.adaptLabel}</p>
        <div className={s.chipRow}>
          {seatedTexts && (
            <button type="button" aria-pressed={seated} className={[s.toggleChip, seated ? s.toggleChipOn : ""].join(" ")} onClick={() => setSeated(!seated)}>
              {t.seatedLabel}
            </button>
          )}
          <button type="button" aria-pressed={compact} className={[s.toggleChip, compact ? s.toggleChipOn : ""].join(" ")} onClick={() => setCompact(!compact)}>
            {t.compactLabel}
          </button>
        </div>
        {compact && <p className={[s.muted, s.note].join(" ")}>{lw(WARMUP_SHARED.compactLine, locale)}</p>}
      </section>

      {/* Kim's evolution: fast with eyes open → slow → slow with eyes closed. */}
      <section aria-label={t.evolutionLabel}>
        <p className={s.kicker}>{t.evolutionLabel}</p>
        <ol className={s.stages}>
          {evolution.map((e, i) => (
            <li key={e} className={s.stage}>
              <span className={[s.stageDot, i === 2 ? s.stageDotClosed : ""].join(" ")} aria-hidden />
              <span className={s.stageLabel}>{e}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Settings fold away: the screen stays about the exercise. */}
      <section className={s.settings}>
        <button
          type="button"
          className={s.settingsToggle}
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <Settings2 size={16} aria-hidden />
          <span className={s.settingsTitle}>{t.optionsTitle}</span>
          <span className={s.settingsSummary}>
            {audio.muted ? t.muteLabel : t.soundLabel}
            {audio.voice && audio.voiceAvailable ? ` · ${t.voiceToggle}` : ""}
            {still ? ` · ${t.stillLabel}` : ""}
          </span>
          <ChevronDown size={16} className={settingsOpen ? s.chevOpen : ""} aria-hidden />
        </button>
        {settingsOpen && (
          <div className={s.options}>
            <Switch
              label={t.soundLabel}
              checked={!audio.muted}
              onChange={(on) => {
                audio.unlock();
                audio.setMuted(!on);
              }}
            />
            <div className={s.demoRow}>
              <button
                type="button"
                className={s.ghostBtn}
                onClick={() => {
                  audio.unlock();
                  audio.playDemo("campana");
                  setTimeout(() => audio.playDemo("tic"), 1400);
                  setTimeout(() => audio.playDemo("cuenco"), 2600);
                  if (opensEyes) setTimeout(() => audio.playDemo("doble"), 5200);
                }}
              >
                <Volume2 size={14} aria-hidden /> {t.soundDemo}
              </button>
              <span className={s.switchHint}>{opensEyes ? t.soundDemoCaptions : t.soundDemoCaptionsEyesOpen}</span>
            </div>
            {audio.voiceAvailable && (
              <Switch label={t.voiceToggle} hint={t.voiceHint} checked={audio.voice} onChange={audio.setVoice} />
            )}
            <Switch label={t.accessibleLabel} checked={accessible} onChange={setAccessible} />
            <Switch label={t.largeTextLabel} checked={largeText} onChange={setLargeText} />
            <Switch label={t.stillLabel} hint={t.stillHelp} checked={still} onChange={setStill} />
            <p className={[s.muted, s.kbd].join(" ")}>{t.keyboardHint}</p>
          </div>
        )}
      </section>
      {reducedMotion && <p className={[s.muted, s.note].join(" ")}>{t.reducedMotionNote}</p>}
      {wakeDenied && <p className={[s.muted, s.note].join(" ")}>{t.wakeLockNote}</p>}
    </div>
  );
}

function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={s.switchRow} onClick={() => onChange(!checked)}>
      <span className={s.switchText}>
        <span className={s.switchLabel}>{label}</span>
        {hint && <span className={s.switchHint}>{hint}</span>}
      </span>
      <span className={[s.switchTrack, checked ? s.switchOn : ""].join(" ")} aria-hidden>
        <span className={s.switchThumb} />
      </span>
    </button>
  );
}
