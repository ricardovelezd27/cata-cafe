import { describe, it, expect } from "vitest";
import { percentOf, radarPoint, radarPolygonPoints, anchorForAngle } from "@/lib/pdf/chartMath";

describe("percentOf", () => {
  it("rounds to whole percent", () => {
    expect(percentOf(3, 7)).toBe(43);
    expect(percentOf(7, 7)).toBe(100);
    expect(percentOf(0, 5)).toBe(0);
  });
  it("is 0 when total is 0 or negative", () => {
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(3, 0)).toBe(0);
    expect(percentOf(3, -1)).toBe(0);
  });
});

describe("radarPoint", () => {
  it("puts spoke 0 straight up at full value", () => {
    const p = radarPoint(0, 8, 9, 1, 9, 100, 150, 150);
    expect(p.x).toBeCloseTo(150, 6);
    expect(p.y).toBeCloseTo(50, 6);
  });
  it("goes clockwise: spoke 2 of 8 points right", () => {
    const p = radarPoint(2, 8, 9, 1, 9, 100, 150, 150);
    expect(p.x).toBeCloseTo(250, 6);
    expect(p.y).toBeCloseTo(150, 6);
  });
  it("maps min to the centre and mid to half radius", () => {
    const c = radarPoint(3, 8, 1, 1, 9, 100, 150, 150);
    expect(c.x).toBeCloseTo(150, 6);
    expect(c.y).toBeCloseTo(150, 6);
    const m = radarPoint(4, 8, 5, 1, 9, 100, 150, 150);
    expect(m.x).toBeCloseTo(150, 6);
    expect(m.y).toBeCloseTo(200, 6);
  });
  it("clamps out-of-range values", () => {
    const hi = radarPoint(0, 8, 99, 1, 9, 100, 0, 0);
    expect(hi.y).toBeCloseTo(-100, 6);
    const lo = radarPoint(0, 8, -5, 1, 9, 100, 0, 0);
    expect(lo.y).toBeCloseTo(0, 6);
  });
  it("collapses to the centre when max <= min", () => {
    const p = radarPoint(0, 8, 5, 5, 5, 100, 10, 20);
    expect(p).toEqual({ x: 10, y: 20 });
  });
});

describe("radarPolygonPoints", () => {
  it("emits one rounded x,y pair per value", () => {
    const pts = radarPolygonPoints([9, 9, 9, 9], 1, 9, 10, 0, 0).split(" ");
    expect(pts).toHaveLength(4);
    expect(pts[0]).toBe("0,-10");
    expect(pts[1]).toBe("10,0");
    expect(pts[2]).toBe("0,10");
    expect(pts[3]).toBe("-10,0");
  });
});

describe("anchorForAngle", () => {
  it("anchors by side", () => {
    expect(anchorForAngle(0, 8)).toBe("middle");
    expect(anchorForAngle(2, 8)).toBe("start");
    expect(anchorForAngle(1, 8)).toBe("start");
    expect(anchorForAngle(6, 8)).toBe("end");
    expect(anchorForAngle(4, 8)).toBe("middle");
  });
});
