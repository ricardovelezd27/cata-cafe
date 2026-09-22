import { describe, expect, it } from "vitest";
import { bracket, type FoldAnchor } from "@/components/landing/journey/bracket";

const anchors: FoldAnchor[] = [
  { i: 0, c: 400 },
  { i: 1, c: 1200 },
  { i: 2, c: 2000 },
  { i: 3, c: 2800 },
  { i: 3, c: 3400 }, // Features re-tags fold 3 → hold
  { i: 4, c: 4600 },
  { i: 5, c: 5600 },
];

describe("bracket", () => {
  it("holds the first fold before the first anchor", () => {
    expect(bracket(anchors, 0, 6)).toEqual({ a: 0, b: 0, blend: 0 });
    expect(bracket(anchors, 400, 6)).toEqual({ a: 0, b: 0, blend: 0 });
  });

  it("holds the last fold after the last anchor", () => {
    expect(bracket(anchors, 5600, 6)).toEqual({ a: 5, b: 5, blend: 0 });
    expect(bracket(anchors, 9000, 6)).toEqual({ a: 5, b: 5, blend: 0 });
  });

  it("blends linearly between two adjacent anchors", () => {
    expect(bracket(anchors, 800, 6)).toEqual({ a: 0, b: 1, blend: 0.5 });
    const r = bracket(anchors, 1400, 6);
    expect(r.a).toBe(1);
    expect(r.b).toBe(2);
    expect(r.blend).toBeCloseTo(0.25, 6);
  });

  it("holds when two consecutive anchors share a fold index", () => {
    const r = bracket(anchors, 3100, 6);
    expect(r.a).toBe(3);
    expect(r.b).toBe(3);
  });

  it("ignores anchors whose index is outside the fold count", () => {
    const withStray = [...anchors, { i: 9, c: 6000 }];
    expect(bracket(withStray, 8000, 6)).toEqual({ a: 5, b: 5, blend: 0 });
  });

  it("does not require anchors to be pre-sorted", () => {
    const shuffled = [...anchors].reverse();
    expect(bracket(shuffled, 800, 6)).toEqual({ a: 0, b: 1, blend: 0.5 });
  });

  it("is monotonic and adjacent-only when sweeping the page", () => {
    let prevA = 0;
    for (let focus = 0; focus <= 6000; focus += 37) {
      const { a, b, blend } = bracket(anchors, focus, 6);
      expect(a).toBeGreaterThanOrEqual(prevA);
      expect(b - a).toBeLessThanOrEqual(1);
      expect(blend).toBeGreaterThanOrEqual(0);
      expect(blend).toBeLessThanOrEqual(1);
      prevA = a;
    }
  });

  it("returns fold 0 when there are no usable anchors", () => {
    expect(bracket([], 100, 6)).toEqual({ a: 0, b: 0, blend: 0 });
  });
});
