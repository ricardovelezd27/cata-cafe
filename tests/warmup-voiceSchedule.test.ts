import { describe, expect, it } from "vitest";
import { CLIP_LATE_MS, CLIP_RESUME_MIN_MS, dueClips, type ClipPoint } from "@/lib/warmup/voiceSchedule";

const clips: ClipPoint[] = [
  { atMs: 0, durMs: 3000, url: "a" },
  { atMs: 6700, durMs: 2500, url: "b" },
  { atMs: 10000, durMs: 1800, url: "c" },
  { atMs: 40000, durMs: 6000, url: "d" },
];

describe("dueClips", () => {
  it("from the start: every line, each at its own time, from its beginning", () => {
    expect(dueClips(clips, 0)).toEqual([
      { url: "a", atMs: 0, offsetMs: 0 },
      { url: "b", atMs: 6700, offsetMs: 0 },
      { url: "c", atMs: 10000, offsetMs: 0 },
      { url: "d", atMs: 40000, offsetMs: 0 },
    ]);
  });
  it("a line that should have started a few ms ago still starts from its beginning, now", () => {
    expect(dueClips(clips, 6700 + CLIP_LATE_MS)[0]).toEqual({ url: "b", atMs: 6700 + CLIP_LATE_MS, offsetMs: 0 });
  });
  it("…but not from further back than that: resuming inside a line picks it up where it is", () => {
    expect(dueClips(clips, 6700 + CLIP_LATE_MS + 1)[0]).toEqual({ url: "b", atMs: 6700 + CLIP_LATE_MS + 1, offsetMs: CLIP_LATE_MS + 1 });
    expect(dueClips(clips, 42000)).toEqual([{ url: "d", atMs: 42000, offsetMs: 2000 }]);
  });
  it("…unless too little of it is left", () => {
    const nearEnd = 46000 - CLIP_RESUME_MIN_MS + 1;
    expect(dueClips(clips, nearEnd)).toEqual([]);
    expect(dueClips(clips, 46000 - CLIP_RESUME_MIN_MS)).toHaveLength(1);
  });
  it("lines that are over are never said again", () => {
    expect(dueClips(clips, 9500).map((c) => c.url)).toEqual(["c", "d"]);
  });
  it("a line that starts ON the stop waits for the next stretch", () => {
    expect(dueClips(clips, 0, { untilMs: 10000 }).map((c) => c.url)).toEqual(["a", "b"]);
    expect(dueClips(clips, 10000, { afterMs: 10000 }).map((c) => c.url)).toEqual(["c", "d"]);
  });
  it("a line that rang out into a stop is not picked up again on resume", () => {
    // "b" (6700..9200) was still speaking when the clock stopped at 8000.
    expect(dueClips(clips, 0, { untilMs: 8000 }).map((c) => c.url)).toEqual(["a", "b"]);
    expect(dueClips(clips, 8000, { afterMs: 8000 }).map((c) => c.url)).toEqual(["c", "d"]);
    // Without the stop (a pause the person asked for cut the line): pick it up.
    expect(dueClips(clips, 8000)[0]).toEqual({ url: "b", atMs: 8000, offsetMs: 1300 });
  });
});
