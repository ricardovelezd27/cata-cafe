// Breath curve for the warm-up breathing field (components/warmup/BreathField.tsx)
// and the "Llega" (arrive) plan. Pure — the player calls these per frame and
// writes the results as CSS custom properties (--scale, --halo).

export interface BreathTiming {
  readonly inMs: number;
  readonly outMs: number;
}

export interface BreathState {
  readonly phase: "in" | "out";
  /** Progress 0..1 within the current phase. */
  readonly u: number;
  /** Bubble scale, 0.62 (empty) .. 1 (full). */
  readonly scale: number;
}

export const DEFAULT_BREATH: BreathTiming = { inMs: 4000, outMs: 6000 };

export const BREATH_SCALE_MIN = 0.62;
export const BREATH_SCALE_MAX = 1;
export const HALO_MIN = 0.25;
export const HALO_MAX = 0.55;
/** The halo trails the bubble by this much. */
export const HALO_LAG_MS = 300;

/** ease-in-out sine, the cubic-bezier(0.37, 0, 0.63, 1) curve. */
const easeInOutSine = (u: number) => -(Math.cos(Math.PI * u) - 1) / 2;

/** 0 (empty) .. 1 (full) fullness of the lungs at `ms`. */
function fullness(ms: number, t: BreathTiming): { phase: "in" | "out"; u: number; eased: number } {
  const cycle = t.inMs + t.outMs;
  const local = ((ms % cycle) + cycle) % cycle;
  if (local < t.inMs) {
    const u = local / t.inMs;
    return { phase: "in", u, eased: easeInOutSine(u) };
  }
  const u = (local - t.inMs) / t.outMs;
  return { phase: "out", u, eased: 1 - easeInOutSine(u) };
}

/** Breath state at `ms` from the start of the first inhale. */
export function breathAt(ms: number, timing: BreathTiming = DEFAULT_BREATH): BreathState {
  const { phase, u, eased } = fullness(ms, timing);
  return { phase, u, scale: BREATH_SCALE_MIN + (BREATH_SCALE_MAX - BREATH_SCALE_MIN) * eased };
}

/** Halo opacity at `ms`: the same curve delayed HALO_LAG_MS, 0.25 .. 0.55.
 *  Before the lag has elapsed the halo rests at its minimum. */
export function halo(ms: number, timing: BreathTiming = DEFAULT_BREATH): number {
  if (ms < HALO_LAG_MS) return HALO_MIN;
  return HALO_MIN + (HALO_MAX - HALO_MIN) * fullness(ms - HALO_LAG_MS, timing).eased;
}

/** "Llega": a posture line, three slow breaths, then a moment to notice. */
export const ARRIVE_PLAN = { postureMs: 6000, cycles: 3, inMs: 4000, outMs: 6000, noticeMs: 4000 } as const;

export const ARRIVE_TOTAL_MS =
  ARRIVE_PLAN.postureMs + ARRIVE_PLAN.cycles * (ARRIVE_PLAN.inMs + ARRIVE_PLAN.outMs) + ARRIVE_PLAN.noticeMs;

export interface ArrivePhaseState {
  readonly phase: "posture" | "breath" | "notice";
  /** 0-based breath cycle (breath phase only). */
  readonly cycle?: number;
  readonly breath?: BreathState;
}

/** Arrive sub-phase at `ms` from the start of "Llega". Past the end it stays
 *  in "notice". */
export function arrivePhaseAt(ms: number): ArrivePhaseState {
  const p = ARRIVE_PLAN;
  if (ms < p.postureMs) return { phase: "posture" };
  const inBreath = ms - p.postureMs;
  const cycleMs = p.inMs + p.outMs;
  if (inBreath < p.cycles * cycleMs) {
    return {
      phase: "breath",
      cycle: Math.floor(inBreath / cycleMs),
      breath: breathAt(inBreath, { inMs: p.inMs, outMs: p.outMs }),
    };
  }
  return { phase: "notice" };
}
