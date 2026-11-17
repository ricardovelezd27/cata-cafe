/**
 * The pure geometry of the capture tool (scripts/ux-capture/lib/geometry.mjs): the effective hit area of a
 * control (its box plus a transparent ::before / ::after that takes pointer events) and the painted size
 * of text (CSS size x the scale it is drawn with). The same functions run inside the page; the fixture
 * pages through real Chrome are in uxCaptureMeasure.test.ts.
 */
import { describe, expect, it } from "vitest";
import { cssLength, effectiveSize, paintedScale, parseMatrix, parseTranslate, pseudoBox, sizeOf, svgScale, transformedBounds, unionBoxes } from "../scripts/ux-capture/lib/geometry.mjs";

const box = (l: number, t: number, w: number, h: number) => ({ l, t, r: l + w, b: t + h });

describe("cssLength / parseTranslate / parseMatrix", () => {
  it("reads px, unitless 0 and % (with a reference); auto, none and junk are null", () => {
    expect(cssLength("12px")).toBe(12);
    expect(cssLength("-0.5px")).toBe(-0.5);
    expect(cssLength("0")).toBe(0);
    expect(cssLength("-50%", 44)).toBe(-22);
    expect(cssLength("-50%")).toBeNull();
    for (const v of ["auto", "none", "normal", "", "calc(1px + 2px)", "12em"]) expect(cssLength(v, 10)).toBeNull();
    expect(cssLength(undefined as unknown as string)).toBeNull();
  });

  it("the individual `translate` property: Tailwind 4's -translate-1/2 is `translate: -50% -50%`", () => {
    expect(parseTranslate("none", 44, 44)).toEqual({ x: 0, y: 0 });
    expect(parseTranslate("-50% -50%", 44, 30)).toEqual({ x: -22, y: -15 });
    expect(parseTranslate("0px -22px", 60, 44)).toEqual({ x: 0, y: -22 });
    expect(parseTranslate("-10px", 60, 44)).toEqual({ x: -10, y: 0 });
  });

  it("matrix() and matrix3d() give the 2D part; none and junk are null", () => {
    expect(parseMatrix("matrix(1, 0, 0, 1, -22, -22)")).toEqual({ a: 1, b: 0, c: 0, d: 1, e: -22, f: -22 });
    expect(parseMatrix("matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 5,6,0,1)")).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 6 });
    expect(parseMatrix("none")).toBeNull();
    expect(parseMatrix("translateX(2px)")).toBeNull();
    expect(parseMatrix("matrix(1, 0, 0)")).toBeNull();
  });

  it("transformedBounds: a scale about an origin and a quarter turn", () => {
    const b = box(0, 0, 40, 20);
    expect(transformedBounds(b, { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }, { x: 0, y: 0 })).toEqual({ l: 0, t: 0, r: 80, b: 40 });
    expect(transformedBounds(b, { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }, { x: 20, y: 10 })).toEqual({ l: -20, t: -10, r: 60, b: 30 });
    const turned = transformedBounds(b, { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 }, { x: 20, y: 10 });
    expect(turned.r - turned.l).toBeCloseTo(20);
    expect(turned.b - turned.t).toBeCloseTo(40);
  });
});

describe("pseudoBox: where a positioned ::before sits, from Chrome's computed style", () => {
  // components/ui/hitArea.ts HIT_44 on a 20 x 20 control at (100, 200): left/top 50%, w/h max(100%, 44px), translate -50% -50%
  const cb = box(100, 200, 20, 20);
  const hit44 = { left: "10px", right: "auto", top: "10px", bottom: "auto", width: "44px", height: "44px", translate: "-50% -50%", transform: "none", transformOrigin: "22px 22px" };

  it("HIT_44: 44 x 44, centred on the control", () => {
    expect(pseudoBox({ cb, fallback: { l: 100, t: 200 }, style: hit44 })).toEqual(box(88, 188, 44, 44));
  });

  it("HIT_Y44: as wide as the control, 44 tall, centred vertically", () => {
    const wide = box(100, 200, 60, 20);
    const style = { left: "0px", right: "0px", top: "10px", bottom: "auto", width: "60px", height: "44px", translate: "0px -22px", transform: "none", transformOrigin: "30px 22px" };
    expect(pseudoBox({ cb: wide, fallback: { l: 100, t: 200 }, style })).toEqual(box(100, 188, 60, 44));
  });

  it("the same box through `transform: translate(-50%, -50%)` (a matrix once computed)", () => {
    const style = { ...hit44, translate: "none", transform: "matrix(1, 0, 0, 1, -22, -22)" };
    expect(pseudoBox({ cb, fallback: { l: 0, t: 0 }, style })).toEqual(box(88, 188, 44, 44));
  });

  it("anchors from the right / bottom, and falls back to the static position when every offset is auto", () => {
    const right = { left: "auto", right: "-12px", top: "auto", bottom: "-12px", width: "44px", height: "44px", translate: "none", transform: "none", transformOrigin: "" };
    expect(pseudoBox({ cb, fallback: { l: 0, t: 0 }, style: right })).toEqual(box(120 + 12 - 44, 220 + 12 - 44, 44, 44));
    const none = { ...right, right: "auto", bottom: "auto" };
    expect(pseudoBox({ cb, fallback: { l: 100, t: 200 }, style: none })).toEqual(box(100, 200, 44, 44));
  });

  it("a pseudo with no usable size is no hit area", () => {
    expect(pseudoBox({ cb, fallback: { l: 0, t: 0 }, style: { ...hit44, width: "0px" } })).toBeNull();
    expect(pseudoBox({ cb, fallback: { l: 0, t: 0 }, style: { ...hit44, height: "auto" } })).toBeNull();
  });
});

describe("effectiveSize: what a tap reaches", () => {
  it("is the union of the own box and every extra, in whole px", () => {
    const own = box(100, 200, 20, 20);
    expect(effectiveSize(own, [])).toEqual({ w: 20, h: 20 });
    expect(effectiveSize(own, [box(88, 188, 44, 44)])).toEqual({ w: 44, h: 44 });
    // a hit area narrower than the control never shrinks it
    expect(effectiveSize(box(0, 0, 60, 20), [box(0, -12, 30, 44)])).toEqual({ w: 60, h: 44 });
  });

  it("a hit area under 44 still leaves the control under 44", () => {
    expect(effectiveSize(box(100, 200, 20, 20), [box(95, 195, 30, 30)])).toEqual({ w: 30, h: 30 });
  });

  it("unionBoxes and sizeOf", () => {
    expect(unionBoxes([box(0, 0, 10, 10), box(5, 5, 10, 10)])).toEqual({ l: 0, t: 0, r: 15, b: 15 });
    expect(sizeOf({ l: 0.4, t: 0, r: 43.6, b: 43.5 })).toEqual({ w: 43, h: 44 });
  });
});

describe("paintedScale / svgScale: the size text is DRAWN at", () => {
  it("an unscaled element is 1, whatever rounding the layout box has", () => {
    expect(paintedScale({ layoutW: 100, layoutH: 20, rectW: 100, rectH: 20 })).toBe(1);
    expect(paintedScale({ layoutW: 100, layoutH: 20, rectW: 99.6, rectH: 19.7 })).toBe(1);
    expect(paintedScale({ layoutW: 9, layoutH: 18, rectW: 8.6, rectH: 17.6 })).toBe(1);
  });

  it("a scaled ancestor shows as the ratio of the painted box to the layout box", () => {
    expect(paintedScale({ layoutW: 400, layoutH: 28, rectW: 200, rectH: 14 })).toBeCloseTo(0.5);
    expect(paintedScale({ layoutW: 100, layoutH: 20, rectW: 150, rectH: 30 })).toBeCloseTo(1.5);
  });

  it("a quarter turn is not a scale", () => {
    expect(paintedScale({ layoutW: 120, layoutH: 18, rectW: 18, rectH: 120 })).toBe(1);
  });

  it("an element with no box is 1 (nothing to scale)", () => {
    expect(paintedScale({ layoutW: 0, layoutH: 0, rectW: 0, rectH: 0 })).toBe(1);
    expect(paintedScale({ layoutW: 50, layoutH: 20, rectW: 0, rectH: 0 })).toBe(1);
  });

  it("an SVG's scale is the length of its y axis in the screen matrix (rotation does not change it)", () => {
    expect(svgScale({ a: 0.5, b: 0, c: 0, d: 0.5 })).toBeCloseTo(0.5);
    expect(svgScale({ a: 2, b: 0, c: 0, d: 2 })).toBeCloseTo(2);
    expect(svgScale({ a: 0, b: 1.5, c: -1.5, d: 0 })).toBeCloseTo(1.5);
    expect(svgScale(null)).toBe(1);
    expect(svgScale({ a: 0, b: 0, c: 0, d: 0 })).toBe(1);
  });
});
