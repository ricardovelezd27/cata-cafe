import { describe, expect, it } from "vitest";
import { WARMUP_EXERCISES } from "@/lib/warmup/exercises";
import { buildExerciseTimeline, poseInSegment, segmentAt } from "@/lib/warmup/timeline";
import { ARRIVE_PLAN, ARRIVE_PLAN_SHORT, arrivePhaseAt, halo } from "@/lib/warmup/breath";
import { extremityAt } from "@/lib/warmup/poses";
import { mulberry32 } from "@/lib/canvas/particles";
import type { ExerciseTimeline, Segment } from "@/lib/warmup/timelineTypes";
import {
  FIELD,
  FIELD_BUDGET,
  blankField,
  fieldDotCount,
  fieldDrawDecision,
  fieldFrameGapMs,
  fieldReach,
  fieldStateAt,
  fillTargets,
  poseOffset,
  sameField,
  seedField,
  type FieldState,
} from "@/lib/warmup/stageField";

// The dots of the warm-up's stage must MEAN the instruction. Every rule here
// is checked against the real timelines of all five exercises, in both modes,
// both lengths, and with "poco espacio" on and off.

const MOVES = new Set<Segment["kind"]>(["out", "back", "cross", "reps"]);

interface Run {
  name: string;
  tl: ExerciseTimeline;
  short: boolean;
}
const RUNS: Run[] = [];
for (const ex of WARMUP_EXERCISES) {
  for (const mode of ["library", "session"] as const) {
    for (const length of ["full", "short"] as const) {
      for (const compact of [false, true]) {
        RUNS.push({
          name: `${ex.id} ${mode} ${length}${compact ? " compact" : ""}`,
          tl: buildExerciseTimeline(ex, { mode, length, compact }),
          short: length === "short",
        });
      }
    }
  }
}

/** The state of the field at a moment of a run, exactly as the player asks for it. */
function stateAt(run: Run, ms: number, reduced = false): FieldState {
  const { tl } = run;
  const { i, u } = segmentAt(tl, ms);
  const seg = tl.segments[i];
  const local = ms - seg.t0Ms;
  const pose = reduced ? (u >= 1 || !MOVES.has(seg.kind) ? seg.to : seg.from) : poseInSegment(seg, local, u);
  let breath: { scale: number; halo: number } | null = null;
  if (seg.kind === "arrive") {
    const plan = run.short ? ARRIVE_PLAN_SHORT : ARRIVE_PLAN;
    const ap = arrivePhaseAt(ms, plan);
    if (ap.phase === "breath" && ap.breath) breath = { scale: ap.breath.scale, halo: halo(ms - plan.postureMs) };
  }
  return fieldStateAt({ kind: tl.kind, seg, u, localMs: local, pose, breath, reduced });
}

const inSeg = (tl: ExerciseTimeline, kind: Segment["kind"]) => tl.segments.filter((s) => s.kind === kind);

describe("the arrival: the disc breathes with you", () => {
  it("is at rest with the lungs empty and widest at the top of the inhale", () => {
    const run = RUNS[0];
    const plan = ARRIVE_PLAN;
    expect(stateAt(run, 1000).spread).toBeCloseTo(FIELD.rest, 3);
    const top = stateAt(run, plan.postureMs + plan.inMs);
    expect(top.spread).toBeCloseTo(1, 3);
    expect(top.ring).toBe(0);
    expect(top.presence).toBe(1);
  });
  it("widens for the whole inhale and gathers for the whole exhale", () => {
    const run = RUNS[0];
    const t0 = ARRIVE_PLAN.postureMs;
    let prev = -Infinity;
    for (let ms = 0; ms <= ARRIVE_PLAN.inMs; ms += 100) {
      const s = stateAt(run, t0 + ms).spread;
      expect(s).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = s;
    }
    prev = Infinity;
    for (let ms = ARRIVE_PLAN.inMs; ms < ARRIVE_PLAN.inMs + ARRIVE_PLAN.outMs; ms += 100) {
      const s = stateAt(run, t0 + ms).spread;
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
  });
  it("under reduced motion the size never changes: only the light follows the breath", () => {
    const run = RUNS[0];
    const t0 = ARRIVE_PLAN.postureMs;
    const empty = stateAt(run, t0 + 10, true);
    const full = stateAt(run, t0 + ARRIVE_PLAN.inMs, true);
    expect(empty.spread).toBe(FIELD.restReduced);
    expect(full.spread).toBe(FIELD.restReduced);
    expect(full.presence).toBeGreaterThan(empty.presence);
    expect(full.jitter).toBe(0);
  });
});

describe("a movement: the cloud goes where the body part goes", () => {
  it("moves the same way on screen as the figure, in every leg of every run", () => {
    let legs = 0;
    for (const run of RUNS) {
      for (const seg of run.tl.segments) {
        if (!MOVES.has(seg.kind) || seg.kind === "reps") continue;
        const a = poseOffset(run.tl.kind, seg.from);
        const b = poseOffset(run.tl.kind, seg.to);
        const fx = b.dx - a.dx;
        const fy = b.dy - a.dy;
        const p = extremityAt(run.tl.kind, seg.from);
        const q = extremityAt(run.tl.kind, seg.to);
        const gx = q.x - p.x;
        const gy = q.y - p.y;
        if (Math.hypot(gx, gy) < 1e-6) continue; // a cross that goes nowhere
        legs++;
        // Same direction: the two displacements point the same way.
        const cos = (fx * gx + fy * gy) / (Math.hypot(fx, fy) * Math.hypot(gx, gy));
        expect(cos, `${run.name} ${seg.kind} step ${seg.stepIdx}`).toBeGreaterThan(0.3);
      }
    }
    expect(legs).toBeGreaterThan(100);
  });
  it("leaves when the figure leaves and arrives exactly when it arrives", () => {
    for (const run of RUNS) {
      for (const seg of run.tl.segments) {
        if (!MOVES.has(seg.kind) || seg.kind === "reps") continue;
        const start = stateAt(run, seg.t0Ms);
        const end = stateAt(run, seg.t0Ms + seg.durMs - 0.001);
        const from = poseOffset(run.tl.kind, seg.from);
        const to = poseOffset(run.tl.kind, seg.to);
        expect(start.dx).toBeCloseTo(from.dx, 4);
        expect(start.dy).toBeCloseTo(from.dy, 4);
        expect(end.dx).toBeCloseTo(to.dx, 3);
        expect(end.dy).toBeCloseTo(to.dy, 3);
      }
    }
  });
  it("is longer along the line of the movement, and only while something moves", () => {
    for (const run of RUNS) {
      for (const seg of run.tl.segments) {
        const mid = stateAt(run, seg.t0Ms + seg.durMs / 2);
        const goes = MOVES.has(seg.kind) && (seg.kind === "reps" || seg.from.a !== seg.to.a || (seg.from.b ?? 0) !== (seg.to.b ?? 0));
        if (goes) {
          expect(mid.stretch, `${run.name} ${seg.kind}`).toBe(FIELD.stretch);
          expect(Math.hypot(mid.axisX, mid.axisY)).toBeCloseTo(1, 5);
        } else {
          expect(mid.stretch, `${run.name} ${seg.kind}`).toBe(1);
        }
      }
    }
  });
  it("never jumps: the centre is continuous across every segment boundary", () => {
    for (const run of RUNS) {
      const segs = run.tl.segments;
      for (let k = 1; k < segs.length; k++) {
        const at = segs[k].t0Ms;
        const before = stateAt(run, at - 0.5);
        const after = stateAt(run, at + 0.5);
        expect(Math.hypot(after.dx - before.dx, after.dy - before.dy), `${run.name} into ${segs[k].kind}`).toBeLessThan(0.02);
      }
    }
  });
  it("the figure stands in front: the dots recede during every step", () => {
    for (const run of RUNS) {
      for (const seg of run.tl.segments) {
        const st = stateAt(run, seg.t0Ms + seg.durMs / 2);
        if (seg.stepIdx >= 0) expect(st.presence).toBe(FIELD.behindFigure);
        else if (seg.kind !== "arrive") expect(st.presence).toBe(1);
      }
    }
  });
});

describe("a hold: the cloud gathers and goes still", () => {
  it("is gathered and motionless once the gather is over, and stays where the leg ended", () => {
    let holds = 0;
    for (const run of RUNS) {
      for (const seg of inSeg(run.tl, "hold")) {
        if (seg.durMs <= FIELD.gatherMs) continue;
        holds++;
        const st = stateAt(run, seg.t0Ms + FIELD.gatherMs + 1);
        expect(st.spread).toBeCloseTo(FIELD.gathered, 4);
        expect(st.jitter).toBeCloseTo(0, 6);
        const at = poseOffset(run.tl.kind, seg.from);
        expect(st.dx).toBeCloseTo(at.dx, 5);
        expect(st.dy).toBeCloseTo(at.dy, 5);
      }
    }
    expect(holds).toBeGreaterThan(20);
  });
  it("gathers gradually: smaller and calmer at every step of the first 0.9 s", () => {
    const run = RUNS.find((r) => inSeg(r.tl, "hold").some((s) => s.durMs > FIELD.gatherMs))!;
    const seg = inSeg(run.tl, "hold").find((s) => s.durMs > FIELD.gatherMs)!;
    let prevSpread = Infinity;
    let prevJit = Infinity;
    for (let ms = 0; ms <= FIELD.gatherMs; ms += 50) {
      const st = stateAt(run, seg.t0Ms + ms);
      expect(st.spread).toBeLessThanOrEqual(prevSpread + 1e-9);
      expect(st.jitter).toBeLessThanOrEqual(prevJit + 1e-9);
      prevSpread = st.spread;
      prevJit = st.jitter;
    }
    expect(stateAt(run, seg.t0Ms).spread).toBeCloseTo(FIELD.open, 4);
  });
});

describe("the closing: the dots settle into one ring", () => {
  it("forms a ring, quietens, and is centred", () => {
    for (const run of RUNS) {
      const seg = inSeg(run.tl, "closing")[0];
      const early = stateAt(run, seg.t0Ms + 10);
      const formed = stateAt(run, seg.t0Ms + FIELD.ringMs + 1);
      const late = stateAt(run, seg.t0Ms + seg.durMs - 1);
      expect(early.ring).toBeLessThan(0.05);
      expect(formed.ring).toBe(1);
      expect(late.spread).toBeCloseTo(FIELD.ringTo, 3);
      expect(late.jitter).toBeLessThan(early.jitter);
      expect(late.jitter).toBeLessThan(0.1);
      expect(late.dx).toBe(0);
      expect(late.dy).toBe(0);
    }
  });
  it("the bridge tightens the ring to a cup (session mode)", () => {
    const sessions = RUNS.filter((r) => r.tl.mode === "session");
    expect(sessions.length).toBeGreaterThan(0);
    for (const run of sessions) {
      const seg = inSeg(run.tl, "bridge")[0];
      const start = stateAt(run, seg.t0Ms + 1);
      const end = stateAt(run, seg.t0Ms + seg.durMs - 1);
      expect(start.ring).toBe(1);
      expect(start.spread).toBeCloseTo(FIELD.ringTo, 2);
      expect(end.spread).toBeCloseTo(FIELD.cup, 2);
    }
  });
});

describe("reduced motion: the field changes only when the figure does", () => {
  it("is the same picture for the whole of a segment (the arrival's light aside)", () => {
    for (const run of RUNS) {
      for (const seg of run.tl.segments) {
        if (seg.kind === "arrive") continue;
        const a = stateAt(run, seg.t0Ms + 1, true);
        const b = stateAt(run, seg.t0Ms + seg.durMs * 0.5, true);
        const c = stateAt(run, seg.t0Ms + seg.durMs - 1, true);
        expect(sameField(a, b), `${run.name} ${seg.kind}`).toBe(true);
        expect(sameField(b, c), `${run.name} ${seg.kind}`).toBe(true);
        expect(a.jitter).toBe(0);
      }
    }
  });
});

describe("the dots stay on the stage", () => {
  // The stage radius is 46 % of the shorter side of the canvas, so the edge
  // of the canvas is at 1 / 0.92 radii from its centre.
  const EDGE = 1 / 0.92;
  it("no state of any run reaches past the edge of the canvas", () => {
    let worst = 0;
    for (const run of RUNS) {
      for (let ms = 0; ms < run.tl.totalMs; ms += 250) worst = Math.max(worst, fieldReach(stateAt(run, ms)));
    }
    expect(worst).toBeLessThanOrEqual(EDGE);
  });
  it("the targets of a state are within its reach, and a ring is a ring", () => {
    const id = seedField(300, mulberry32(7));
    const x = new Float32Array(300);
    const y = new Float32Array(300);
    const st = blankField();
    st.spread = 0.56;
    st.dx = 0.3;
    st.axisX = 1;
    st.stretch = FIELD.stretch;
    fillTargets(st, id, 300, x, y);
    for (let i = 0; i < 300; i++) expect(Math.hypot(x[i], y[i])).toBeLessThanOrEqual(fieldReach(st) + 1e-6);
    // Nearer dots travel further than the far ones (depth).
    const mean = x.reduce((s, v) => s + v, 0) / 300;
    expect(mean).toBeGreaterThan(0.25);
    expect(mean).toBeLessThan(0.35);

    const ring = blankField();
    ring.ring = 1;
    ring.spread = 0.6;
    fillTargets(ring, id, 300, x, y);
    for (let i = 0; i < 300; i++) {
      const r = Math.hypot(x[i], y[i]) / 0.6;
      expect(r).toBeGreaterThanOrEqual(0.9 - 1e-5);
      expect(r).toBeLessThanOrEqual(1 + 1e-5);
    }
  });
  it("only the live dots are written (the governor's cut)", () => {
    const id = seedField(100, mulberry32(7));
    const x = new Float32Array(100).fill(99);
    const y = new Float32Array(100).fill(99);
    fillTargets(blankField(), id, 60, x, y);
    expect(x[59]).not.toBe(99);
    expect(x[60]).toBe(99);
  });
  it("the same seed gives the same cloud", () => {
    const a = seedField(50, mulberry32(0x5eed));
    const b = seedField(50, mulberry32(0x5eed));
    expect(Array.from(a.rad)).toEqual(Array.from(b.rad));
    expect(Array.from(a.depth)).toEqual(Array.from(b.depth));
    for (const d of a.depth) {
      expect(d).toBeGreaterThanOrEqual(FIELD.depthMin);
      expect(d).toBeLessThanOrEqual(FIELD.depthMax);
    }
  });
});

describe("the drawing budget", () => {
  it("at most 300 dots on a phone, fewer on a weak one", () => {
    expect(fieldDotCount({ coarse: true, weak: false })).toBe(300);
    expect(fieldDotCount({ coarse: true, weak: true })).toBe(180);
    expect(fieldDotCount({ coarse: false, weak: false })).toBeLessThanOrEqual(600);
    expect(FIELD_BUDGET.phoneDots).toBeLessThanOrEqual(300);
  });
  it("never more than 30 frames a second, about 10 when nobody is watching", () => {
    expect(fieldFrameGapMs(false)).toBeGreaterThanOrEqual(33);
    expect(fieldFrameGapMs(true)).toBeGreaterThanOrEqual(100);
    expect(FIELD_BUDGET.drawBudgetMs).toBeLessThanOrEqual(4);
  });
  // The player's loop calls at the screen's rate (60 or 120 times a second in
  // the arrival and the fast repetitions): count what the field really draws.
  const drawsInOneSecond = (callEveryMs: number, unwatched: boolean) => {
    let last = -Infinity;
    let draws = 0;
    for (let t = 0; t < 1000; t += callEveryMs) {
      if (fieldDrawDecision({ sinceLastMs: t - last, unwatched, force: false, settled: false, jitter: 1, unchanged: false }) === "draw") {
        draws++;
        last = t;
      }
    }
    return draws;
  };
  it("a loop at 60 or 120 Hz gives at most 30 draws a second, and at most 10 unwatched", () => {
    for (const hz of [60, 120]) {
      expect(drawsInOneSecond(1000 / hz, false)).toBeLessThanOrEqual(31);
      expect(drawsInOneSecond(1000 / hz, false)).toBeGreaterThanOrEqual(24);
      expect(drawsInOneSecond(1000 / hz, true)).toBeLessThanOrEqual(11);
      expect(drawsInOneSecond(1000 / hz, true)).toBeGreaterThanOrEqual(8);
    }
  });
  it("draws nothing when the picture would not change, and always when forced", () => {
    const base = { sinceLastMs: 1000, unwatched: false, force: false, settled: true, jitter: 0, unchanged: true };
    expect(fieldDrawDecision(base)).toBe("same");
    expect(fieldDrawDecision({ ...base, jitter: 0.2 })).toBe("draw"); // the dots drift
    expect(fieldDrawDecision({ ...base, settled: false })).toBe("draw"); // still arriving
    expect(fieldDrawDecision({ ...base, unchanged: false })).toBe("draw"); // a new state
    expect(fieldDrawDecision({ ...base, sinceLastMs: 5 })).toBe("wait");
    expect(fieldDrawDecision({ ...base, sinceLastMs: 5, force: true })).toBe("draw");
  });
  it("under reduced motion a whole segment is one draw", () => {
    // Reduced motion: no drift, every draw snaps (so the dots are settled after
    // it), and the state is the same for the whole segment (tested above).
    let draws = 0;
    let settled = false;
    let unchanged = false;
    for (let t = 0; t < 15000; t += 33) {
      if (fieldDrawDecision({ sinceLastMs: 33, unwatched: false, force: false, settled, jitter: 0, unchanged }) === "draw") {
        draws++;
        settled = true;
        unchanged = true;
      }
    }
    expect(draws).toBe(1);
  });
});
