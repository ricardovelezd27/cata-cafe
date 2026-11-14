import { describe, expect, it } from "vitest";
import { CUE_LATE_MS, RESUME_AFTER_STOP_MS, dueCues, dueHums, resumeAfterStop, ringsOut } from "@/lib/warmup/audioWindow";
import { WARMUP_EXERCISES } from "@/lib/warmup/exercises";
import { buildExerciseTimeline } from "@/lib/warmup/timeline";
import type { CuePoint, HumWindow } from "@/lib/warmup/timelineTypes";

const cue = (atMs: number, kind: CuePoint["kind"] = "campana"): CuePoint => ({ atMs, kind, segIdx: 0 });
const hum = (fromMs: number, toMs: number): HumWindow => ({ fromMs, toMs, stepIdx: 0, contour: "rise" });
const at = (list: readonly CuePoint[]) => list.map((c) => c.atMs);

describe("dueCues", () => {
  const cues = [cue(0), cue(1000), cue(5000, "tic"), cue(9000), cue(12000, "doble")];

  it("with no window keeps every cue from just before the position on", () => {
    expect(at(dueCues(cues, 0))).toEqual([0, 1000, 5000, 9000, 12000]);
    expect(at(dueCues(cues, 1000 + CUE_LATE_MS))).toEqual([1000, 5000, 9000, 12000]);
    expect(at(dueCues(cues, 1000 + CUE_LATE_MS + 1))).toEqual([5000, 9000, 12000]);
  });

  it("schedules nothing after the point where the clock stops by itself", () => {
    expect(at(dueCues(cues, 0, { untilMs: 5000 }))).toEqual([0, 1000, 5000]);
    expect(at(dueCues(cues, 0, { untilMs: 4999 }))).toEqual([0, 1000]);
  });

  it("keeps the cue that sits exactly on the stop: it is the sound of that stop", () => {
    expect(at(dueCues(cues, 6000, { untilMs: 12000 }))).toEqual([9000, 12000]);
  });

  it("after a stop that rang out, does not play that stop's cue again", () => {
    expect(at(dueCues(cues, 5003, { afterMs: 5000, untilMs: 9000 }))).toEqual([9000]);
    // Without afterMs the same resume would repeat the tic at 5000.
    expect(at(dueCues(cues, 5003, { untilMs: 9000 }))).toEqual([5000, 9000]);
  });
});

describe("dueHums", () => {
  const hums = [hum(0, 4000), hum(5000, 9000), hum(9500, 14000)];

  it("drops windows that already ended and keeps one that is under way", () => {
    expect(dueHums(hums, 4000)).toEqual([hums[1], hums[2]]);
    expect(dueHums(hums, 6000)).toEqual([hums[1], hums[2]]);
  });

  it("cuts a window at the stop and drops the ones that start at or after it", () => {
    expect(dueHums(hums, 0, { untilMs: 7000 })).toEqual([hums[0], { ...hums[1], toMs: 7000 }]);
    expect(dueHums(hums, 0, { untilMs: 5000 })).toEqual([hums[0]]);
    expect(dueHums(hums, 0, { untilMs: 9000 })).toEqual([hums[0], hums[1]]);
  });
});

describe("ringsOut", () => {
  it("only a stop the clock made by itself lets the sound finish", () => {
    expect(ringsOut("stop")).toBe(true);
    expect(ringsOut("done")).toBe(true);
    expect(ringsOut("pause")).toBe(false);
    expect(ringsOut("seek")).toBe(false);
    expect(ringsOut("play")).toBe(false);
    expect(ringsOut(null)).toBe(false);
  });
});

describe("resumeAfterStop", () => {
  it("is the stop position only when the run resumes right there", () => {
    expect(resumeAfterStop(5000, 5000)).toBe(5000);
    expect(resumeAfterStop(5000, 5000 + RESUME_AFTER_STOP_MS - 1)).toBe(5000);
    expect(resumeAfterStop(5000, 5000 + RESUME_AFTER_STOP_MS)).toBeUndefined();
    expect(resumeAfterStop(5000, 4000)).toBeUndefined();
    expect(resumeAfterStop(null, 5000)).toBeUndefined();
  });
});

describe("against the real timelines", () => {
  it("a library run schedules its final doble, exactly at the end of the run", () => {
    for (const ex of WARMUP_EXERCISES) {
      const tl = buildExerciseTimeline(ex, { mode: "library" });
      const last = dueCues(tl.cues, tl.closingAt, { untilMs: tl.totalMs }).at(-1);
      expect(last, ex.id).toEqual(expect.objectContaining({ kind: "doble", atMs: tl.totalMs }));
    }
  });

  it("stopping at a step end (Quieto) schedules no sound of the next step", () => {
    for (const ex of WARMUP_EXERCISES) {
      const tl = buildExerciseTimeline(ex, { mode: "library" });
      for (let i = 0; i < ex.steps.length; i++) {
        const from = tl.stepStart[i];
        const until = tl.stepEnd[i];
        expect(dueCues(tl.cues, from, { untilMs: until }).every((c) => c.atMs <= until), `${ex.id} cues ${i}`).toBe(true);
        expect(dueHums(tl.hums, from, { untilMs: until }).every((h) => h.toMs <= until && h.fromMs < until), `${ex.id} hums ${i}`).toBe(true);
      }
    }
  });

  it("stop, then resume: each cue of the run is scheduled exactly once", () => {
    for (const ex of WARMUP_EXERCISES) {
      const tl = buildExerciseTimeline(ex, { mode: "library" });
      const stops = [tl.arriveMs, ...tl.stepEnd.slice(0, -1)];
      const heard: number[] = [];
      let from = 0;
      let afterMs: number | undefined;
      for (const until of [...stops, tl.totalMs]) {
        heard.push(...at(dueCues(tl.cues, from, { untilMs: until, afterMs })));
        from = until + 3; // the schedule runs a few ms after the clock resumed
        afterMs = resumeAfterStop(until, from);
      }
      expect(heard, ex.id).toEqual(at(tl.cues));
    }
  });
});
