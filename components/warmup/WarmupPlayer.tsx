"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { WARMUP_SHARED, lw, type WarmupExercise } from "@/lib/warmup/exercises";
import { buildExerciseTimeline, poseInSegment, segmentAt, sequenceMap, stepSegments } from "@/lib/warmup/timeline";
import { arrivePhaseAt, halo as haloAt } from "@/lib/warmup/breath";
import { partTransforms, passedDots, torsoBreathTransform } from "@/lib/warmup/poses";
import { previewSpec } from "@/lib/warmup/preview";
import { saveReflection } from "@/lib/warmup/reflections";
import type { Pose, Segment } from "@/lib/warmup/timelineTypes";
import { useRunClock } from "@/hooks/useRunClock";
import { useWarmupAudio } from "@/hooks/useWarmupAudio";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useLocalFlag } from "@/hooks/useLocalFlag";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { WarmupFigure } from "@/components/warmup/figures";
import { StepProgress } from "./StepProgress";
import { BreathBubble } from "./BreathBubble";
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
  /** Final screen's button / end of the bridge. */
  onFinish?: () => void;
  /** × "Saltar ejercicio" / "Cerrar" / Escape — the person leaves early. */
  onExit?: () => void;
  /** md:+ only: render inside the page instead of fixed full-screen. */
  inline?: boolean;
  /** Synced run: skip the intro and start the clock at this elapsed ms. */
  seekToMs?: number;
  /** Synced followers: sound off until they opt in. */
  soundDefault?: boolean;
  /** "La cata empezó": show the docked bar, leave at the end of the leg or
   *  when `deadlineMs` (wall clock, Date.now()) passes. */
  exitRequest?: { deadlineMs: number; label: string; leavingIn: string } | null;
  className?: string;
}

type Phase = "intro" | "run" | "reflect" | "done";

const MOVING = new Set<Segment["kind"]>(["out", "back", "cross", "reps"]);
const fill = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), tpl);
const CHROME_HIDE_MS = 4000;
const VOICE_TAIL_MS = 500;

export function WarmupPlayer({
  exercise,
  locale,
  t,
  mode = "library",
  onFinish,
  onExit,
  inline = false,
  seekToMs,
  soundDefault,
  exitRequest = null,
  className,
}: WarmupPlayerProps) {
  const reducedMotion = useReducedMotion();
  const audio = useWarmupAudio(locale);
  const [accessible, setAccessible] = useLocalFlag("cata_warmup_numeral", false);
  const [largeText, setLargeText] = useLocalFlag("cata_warmup_largetext", false);
  const [still, setStill] = useLocalFlag("cata_warmup_still", false);
  const synced = mode === "synced";
  const sessionLike = mode !== "library";

  const tl = useMemo(
    () => buildExerciseTimeline(exercise, { mode: sessionLike ? "session" : "library" }),
    [exercise, sessionLike],
  );
  const steps = exercise.steps;
  const total = steps.length;
  const name = lw(exercise.name, locale);

  const [phase, setPhase] = useState<Phase>(seekToMs != null ? "run" : "intro");
  const [runKey, setRunKey] = useState(0);
  const [answers, setAnswers] = useState<[string, string]>(["", ""]);
  const [saved, setSaved] = useState(false);

  // ── Clock ─────────────────────────────────────────────────────────────
  const clock = useRunClock(tl.totalMs, {
    resetKey: `${exercise.id}:${runKey}:${phase === "run" ? "run" : "idle"}`,
    autoStart: phase === "run",
    pauseOnHide: !synced,
    onDone: () => {
      if (sessionLike) onFinish?.();
      else setPhase("reflect");
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
  const bubbleRef = useRef<HTMLDivElement>(null);
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

      // Bar.
      if (bar && sg.stepIdx >= 0 && stepSegs.first >= 0) {
        const localIdx = i - stepSegs.first;
        const fillEl = bar.querySelector<HTMLElement>(`[data-seg-fill="${localIdx}"]`);
        if (fillEl) {
          const p = sg.kind === "read" || sg.kind === "lead-in" ? 0 : u;
          fillEl.style.setProperty("--p", p.toFixed(4));
        }
        if (sg.kind === "hold") {
          const lit = Math.min(3, Math.floor(local / 1000) + 1);
          for (let k = 0; k < 3; k++) {
            const dot = bar.querySelector<HTMLElement>(`[data-hold-dot="${localIdx}-${k}"]`);
            if (!dot) continue;
            const want = k < lit ? "1" : null;
            if ((dot.getAttribute("data-lit") ?? null) !== want) {
              if (want) dot.setAttribute("data-lit", "1");
              else dot.removeAttribute("data-lit");
            }
          }
        }
      } else if (bar && sg.stepIdx < 0 && sg.kind !== "arrive") {
        bar.querySelector<HTMLElement>('[data-seg-fill="0"]')?.style.setProperty("--p", u.toFixed(4));
      }

      // Bubble (arrive).
      if (sg.kind === "arrive" && bubbleRef.current) {
        const ap = arrivePhaseAt(elapsed);
        const root = bubbleRef.current;
        if (ap.phase === "breath" && ap.breath) {
          root.style.setProperty("--scale", ap.breath.scale.toFixed(4));
          root.style.setProperty("--halo", haloAt(elapsed - 6000).toFixed(3));
        } else {
          root.style.setProperty("--scale", "0.62");
          root.style.setProperty("--halo", "0.25");
        }
      }
      return { i, u, local, sg };
    },
    [tl, reducedMotion, stepSegs, pathSeg],
  );

  // Segment-level reactions (edge-detected by the loop and by the layout paint).
  const onSegmentChange = useCallback(
    (prevIdx: number, nextIdx: number) => {
      const prev = tl.segments[prevIdx];
      const next = tl.segments[nextIdx];
      // Turn halo + lead glow.
      if (barRef.current && prev && MOVING.has(prev.kind) && prev.stepIdx === next.stepIdx) {
        const localPrev = prevIdx - stepSegs.first;
        const h = barRef.current.querySelector<HTMLElement>(`[data-halo="${localPrev}"]`);
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
    [tl, stepSegs.first],
  );

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
          const ap = arrivePhaseAt(elapsed);
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
  }, [running, elapsedMs, tl, paint, onSegmentChange, accessible, reducedMotion, t, audio]);

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
    if (running) audio.schedule(tl.cues, elapsedMs());
    else audio.cancel();
  }, [running, runId, audio, tl, elapsedMs]);
  useEffect(() => () => audio.cancel(), [audio]);

  // iOS "interrupted" → pause.
  useEffect(() => {
    if (audio.interrupted && running) clock.pause();
  }, [audio.interrupted, running, clock]);

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
  // Voice: read the step aloud during its read beat and hold the clock there
  // until the voice finishes (+ a short tail). Library / session only.
  const voiceStopRef = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== "run") return;
    const quieto = stopForQuieto(segIdx);
    const voiceStop = voiceStopRef.current;
    const stops = [quieto, voiceStop].filter((x): x is number => x !== null);
    setClockStopAt(stops.length ? Math.min(...stops) : null);
  }, [phase, segIdx, stopForQuieto, setClockStopAt]);

  useEffect(() => {
    if (phase !== "run" || !audio.voice || !audio.voiceAvailable || synced) return;
    if (seg.kind !== "read" || !step) return;
    const readEnd = seg.t0Ms + seg.durMs;
    voiceStopRef.current = readEnd;
    clock.setStopAt(Math.min(readEnd, stopForQuieto(segIdx) ?? Infinity));
    let cancelled = false;
    void audio.speak(lw(step.text, locale), locale).then(() => {
      if (cancelled) return;
      voiceStopRef.current = null;
      const resume = () => {
        if (cancelled) return;
        const q = stopForQuieto(segIdx);
        clock.setStopAt(q);
        if (clock.elapsedMs() >= readEnd - 1 && !clock.running) clock.play();
      };
      setTimeout(resume, VOICE_TAIL_MS);
    });
    return () => {
      cancelled = true;
      voiceStopRef.current = null;
      audio.cancelSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, segIdx, audio.voice, audio.voiceAvailable]);

  // ── Navigation ────────────────────────────────────────────────────────
  const start = useCallback(() => {
    audio.unlock();
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
      else setPhase("reflect");
      return;
    }
    clock.seek(target, { play: true });
  }, [phase, start, tl, segIdx, total, clock, sessionLike, onFinish]);

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

  const exit = useCallback(() => {
    audio.cancel();
    audio.cancelSpeech();
    onExit?.();
  }, [audio, onExit]);

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
    ? arrivePhaseAt(clock.elapsedMs()).phase === "posture"
      ? exercise.posture === "standing"
        ? t.arrivePostureStanding
        : t.arrivePosture
      : arrivePhaseAt(clock.elapsedMs()).phase === "notice"
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

  const submitReflection = (keep: boolean) => {
    if (keep) setSaved(saveReflection(exercise.id, answers));
    setPhase("done");
  };
  const repeat = () => {
    setAnswers(["", ""]);
    setSaved(false);
    setPhase("intro");
  };

  const figurePath = pathSeg ? { from: pathSeg.seg.from, to: pathSeg.seg.to, progress: pathSeg.reached ? 1 : 0 } : null;
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
      onPointerDown={revealChrome}
      onPointerMove={chromeHidden ? revealChrome : undefined}
    >
      {/* ── Top bar: the single exit, never hides ── */}
      <header className={s.topbar}>
        {onExit ? (
          <button type="button" className={s.exitBtn} onClick={exit} aria-label={sessionLike ? t.skipExercise : t.close}>
            <X size={20} aria-hidden />
            {sessionLike && <span>{t.skipExercise}</span>}
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
          <BreathBubble ref={bubbleRef} phase={arriveLabel.phase} label={arriveLabel.text} dusk={dusk} />
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
      {phase === "run" && !isArrive && (
        <StepProgress
          ref={barRef}
          segments={stepSegs.segments}
          activeIdx={segIdx - stepSegs.first}
          labels={labels}
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
            <p key={`${segIdx}-cue`} className={[s.cue, moving && dusk ? s.cueMoving : "", s.fadeIn].join(" ")}>
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
            onSubmit={(e) => {
              e.preventDefault();
              submitReflection(true);
            }}
          >
            <h2 className={s.title}>{t.reflectTitle}</h2>
            <p className={s.muted}>{t.reflectLead}</p>
            {exercise.closing.map((q, i) => (
              <div key={i} className={s.field}>
                <label className={s.question} htmlFor={`warmup-reflect-${i}`}>
                  {lw(q, locale)}
                </label>
                <textarea
                  id={`warmup-reflect-${i}`}
                  className={s.textarea}
                  rows={3}
                  maxLength={2000}
                  value={answers[i]}
                  placeholder={t.answerLabel}
                  onChange={(e) => setAnswers((a) => (i === 0 ? [e.target.value, a[1]] : [a[0], e.target.value]))}
                />
              </div>
            ))}
            <div className={s.reflectActions}>
              <button type="button" className={s.ghostBtn} onClick={() => submitReflection(false)}>
                {t.omit}
              </button>
              <button type="submit" className={s.primaryBtn}>
                {t.save}
              </button>
            </div>
          </form>
        )}

        {phase === "done" && (
          <>
            <h2 className={s.title}>{t.doneTitle}</h2>
            <p className={s.lead}>{t.doneBody}</p>
            {saved && <p className={s.savedNote}>{t.savedNote}</p>}
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
              <button type="button" className={s.primaryBtn} onClick={onFinish ?? onExit}>
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
            onClick={clock.toggle}
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
  return (
    <>
      <h1 className={s.title}>{lw(exercise.name, locale)}</h1>
      <p className={s.lead}>{lw(exercise.purpose, locale)}</p>
      <p className={s.muted}>
        {fill(t.minutes, { min: exercise.durationMin })} · {fill(t.stepsCount, { count: total })} ·{" "}
        {lw(WARMUP_SHARED.posture[exercise.posture], locale)}
      </p>
      <p className={s.kicker}>{t.postureLabel}</p>
      <p className={s.lead}>{lw(exercise.postureText, locale)}</p>
      <p className={s.kicker}>{t.sequenceLabel}</p>
      <p className={s.sequence}>{sequence.join(" · ")}</p>
      <p className={s.kicker}>{t.evolutionLabel}</p>
      <div className={s.evolution}>
        {evolution.map((e) => (
          <span key={e} className={s.chip}>
            {e}
          </span>
        ))}
      </div>
      <p className={s.safety}>
        <strong>{lw(WARMUP_SHARED.safety.title, locale)}.</strong> {lw(WARMUP_SHARED.safety.text, locale)}
      </p>
      <p className={s.kicker}>{t.optionsTitle}</p>
      <div className={s.options}>
        <Switch label={t.soundLabel} checked={!audio.muted} onChange={(on) => {
          audio.unlock();
          audio.setMuted(!on);
        }} />
        <div className={s.demoRow}>
          <button
            type="button"
            className={s.ghostBtn}
            onClick={() => {
              audio.unlock();
              audio.playDemo("campana");
              setTimeout(() => audio.playDemo("tic"), 1400);
              setTimeout(() => audio.playDemo("cuenco"), 2600);
              setTimeout(() => audio.playDemo("doble"), 5200);
            }}
          >
            {t.soundDemo}
          </button>
          <span className={s.switchHint}>{t.soundDemoCaptions}</span>
        </div>
        {audio.voiceAvailable && (
          <Switch label={t.voiceToggle} hint={t.voiceHint} checked={audio.voice} onChange={audio.setVoice} />
        )}
        <Switch label={t.accessibleLabel} checked={accessible} onChange={setAccessible} />
        <Switch label={t.largeTextLabel} checked={largeText} onChange={setLargeText} />
        <Switch label={t.stillLabel} hint={t.stillHelp} checked={still} onChange={setStill} />
      </div>
      {reducedMotion && <p className={[s.muted, s.note].join(" ")}>{t.reducedMotionNote}</p>}
      {wakeDenied && <p className={[s.muted, s.note].join(" ")}>{t.wakeLockNote}</p>}
      <p className={[s.muted, s.kbd].join(" ")}>{t.keyboardHint}</p>
    </>
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
