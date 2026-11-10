import { describe, expect, it } from "vitest";
import { applySubmitEvent, computeSubmitProgress, seedSubmitMap } from "@/lib/submitProgress";

const samples = ["s1", "s2", "s3", "s4", "s5", "s6"];
const cuppers = ["a", "b", "c", "d", "e"];

describe("submit progress", () => {
  it("one participant submitting 6 samples moves the counter by exactly 1", () => {
    let map = seedSubmitMap([]);
    const before = computeSubmitProgress(map, samples, cuppers);
    for (const [i, s] of samples.entries()) {
      map = applySubmitEvent(map, { cupperId: "a", sampleId: s, isDraft: false });
      const now = computeSubmitProgress(map, samples, cuppers).done;
      expect(now).toBe(i === samples.length - 1 ? before.done + 1 : before.done);
    }
    expect(computeSubmitProgress(map, samples, cuppers)).toEqual({ done: 1, total: 5 });
  });

  it("a repeated or autosave event of an already-submitted row changes nothing", () => {
    const map = seedSubmitMap(samples.map((s) => ({ cupperId: "a", sampleId: s })));
    const again = applySubmitEvent(map, { cupperId: "a", sampleId: "s3", isDraft: false });
    expect(again).toBe(map); // same identity: React bails out
    expect(computeSubmitProgress(again, samples, cuppers).done).toBe(1);
  });

  it("a draft event for a never-submitted row is a no-op, for a submitted row it un-submits", () => {
    const map = seedSubmitMap(samples.map((s) => ({ cupperId: "a", sampleId: s })));
    expect(applySubmitEvent(map, { cupperId: "b", sampleId: "s1", isDraft: true })).toBe(map);
    const back = applySubmitEvent(map, { cupperId: "a", sampleId: "s1", isDraft: true });
    expect(computeSubmitProgress(back, samples, cuppers).done).toBe(0);
  });

  it("re-seeding from the server equals the server value (reconnect)", () => {
    const rows = [
      ...samples.map((s) => ({ cupperId: "a", sampleId: s })),
      { cupperId: "b", sampleId: "s1" },
    ];
    expect(computeSubmitProgress(seedSubmitMap(rows), samples, cuppers)).toEqual({ done: 1, total: 5 });
  });

  it("only eligible cuppers count (excluded and invited are not in the list)", () => {
    const map = seedSubmitMap(samples.map((s) => ({ cupperId: "zz", sampleId: s })));
    expect(computeSubmitProgress(map, samples, cuppers).done).toBe(0);
  });

  it("a session with no samples never reports anyone as done", () => {
    expect(computeSubmitProgress(new Map(), [], cuppers)).toEqual({ done: 0, total: 5 });
  });
});
