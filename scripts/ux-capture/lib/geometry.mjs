/**
 * The geometry the measure needs, as PURE functions (tested in tests/uxCaptureGeometry.test.ts).
 *
 * They are also run INSIDE the page: `geometryKit` is one self-contained function (it references
 * nothing outside its own body), so `measure.mjs` can serialise it with `toString()` and call it in
 * the page, and the unit tests call the very same code. Boxes are `{ l, t, r, b }` in px.
 */

/** Everything below, built once. Self-contained on purpose (see the file comment). */
export function geometryKit() {
  /** "12px" | "-50%" | "0" -> number; "auto" | "none" | "normal" | anything else -> null. A % needs `ref`. */
  const cssLength = (v, ref) => {
    if (typeof v !== "string") return null;
    const m = /^(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|%)?$/i.exec(v.trim());
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (m[2] === "%") return ref == null ? null : (n / 100) * ref;
    return n;
  };

  /** The `translate` property (Tailwind 4 writes -translate-y-1/2 as `translate`, not `transform`). */
  const parseTranslate = (v, w, h) => {
    if (!v || v === "none") return { x: 0, y: 0 };
    const parts = v.trim().split(/\s+/);
    return { x: cssLength(parts[0], w) ?? 0, y: parts.length > 1 ? (cssLength(parts[1], h) ?? 0) : 0 };
  };

  /** matrix(a,b,c,d,e,f) or matrix3d(...) -> { a,b,c,d,e,f }; "none" or anything else -> null. */
  const parseMatrix = (v) => {
    if (!v || v === "none") return null;
    const m = /^matrix(3d)?\(([^)]*)\)$/.exec(v.trim());
    if (!m) return null;
    const n = m[2].split(",").map((x) => parseFloat(x));
    if (n.some((x) => !Number.isFinite(x))) return null;
    if (m[1]) return n.length === 16 ? { a: n[0], b: n[1], c: n[4], d: n[5], e: n[12], f: n[13] } : null;
    return n.length === 6 ? { a: n[0], b: n[1], c: n[2], d: n[3], e: n[4], f: n[5] } : null;
  };

  /** The box that bounds `box` after the 2D matrix `m` about the point `origin` ({x, y} in the box's own space). */
  const transformedBounds = (box, m, origin) => {
    const pts = [
      [box.l, box.t],
      [box.r, box.t],
      [box.r, box.b],
      [box.l, box.b],
    ].map(([x, y]) => {
      const px = x - origin.x;
      const py = y - origin.y;
      return [m.a * px + m.c * py + m.e + origin.x, m.b * px + m.d * py + m.f + origin.y];
    });
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) };
  };

  /**
   * Where a positioned `::before` / `::after` box is, from the COMPUTED style Chrome reports (used values in px).
   * @param {{ cb: {l,t,r,b}, fallback: {l,t}, style: Record<string, string> }} input
   *   cb = the containing block's padding box; fallback = where the box sits when left/right (top/bottom) are both auto.
   * @returns {{l,t,r,b}|null} null when the pseudo has no usable size.
   */
  const pseudoBox = ({ cb, fallback, style }) => {
    const w = cssLength(style.width);
    const h = cssLength(style.height);
    if (w == null || h == null || w <= 0 || h <= 0) return null;
    const left = cssLength(style.left, cb.r - cb.l);
    const right = cssLength(style.right, cb.r - cb.l);
    const top = cssLength(style.top, cb.b - cb.t);
    const bottom = cssLength(style.bottom, cb.b - cb.t);
    const l = left != null ? cb.l + left : right != null ? cb.r - right - w : fallback.l;
    const t = top != null ? cb.t + top : bottom != null ? cb.b - bottom - h : fallback.t;
    let box = { l, t, r: l + w, b: t + h };
    const m = parseMatrix(style.transform);
    if (m) {
      const o = (style.transformOrigin || "").trim().split(/\s+/);
      box = transformedBounds(box, m, { x: l + (cssLength(o[0], w) ?? w / 2), y: t + (cssLength(o[1], h) ?? h / 2) });
    }
    const tr = parseTranslate(style.translate, w, h);
    return { l: box.l + tr.x, t: box.t + tr.y, r: box.r + tr.x, b: box.b + tr.y };
  };

  /** The box that contains every box. */
  const unionBoxes = (boxes) => ({
    l: Math.min(...boxes.map((x) => x.l)),
    t: Math.min(...boxes.map((x) => x.t)),
    r: Math.max(...boxes.map((x) => x.r)),
    b: Math.max(...boxes.map((x) => x.b)),
  });

  /** A box's size in whole px (what the tool reports). */
  const sizeOf = (box) => ({ w: Math.round(box.r - box.l), h: Math.round(box.b - box.t) });

  /**
   * The size a tap can reach: the element's own box, grown by every extra box that takes pointer
   * events (a positioned pseudo-element, the label of a checkbox or radio).
   * @param {{l,t,r,b}} own
   * @param {Array<{l,t,r,b}>} extras
   */
  const effectiveSize = (own, extras) => sizeOf(unionBoxes([own, ...extras]));

  /**
   * How much bigger (or smaller) than its layout box an HTML element is PAINTED: a transform or a zoom
   * on it or on an ancestor. `offsetWidth/Height` are the layout size (no transforms); the bounding rect
   * is the painted one. Sorting each pair of sides makes a quarter-turn irrelevant. The layout size is
   * rounded to whole px, so a painted size within half a px of the layout size reads as 1. For a turn of
   * another angle the bounding box is larger than the element, so the scale can only be over-read, never
   * under-read: the count of small text stays on the safe side.
   */
  const paintedScale = ({ layoutW, layoutH, rectW, rectH }) => {
    const [a, b] = [layoutW, layoutH].sort((x, y) => x - y);
    const [c, d] = [rectW, rectH].sort((x, y) => x - y);
    if (!(a > 0) || !(b > 0) || !(c > 0) || !(d > 0)) return 1;
    if (Math.abs(c - a) <= 0.51 && Math.abs(d - b) <= 0.51) return 1;
    return Math.min(c / a, d / b);
  };

  /** The scale an SVG element is drawn with, from its screen matrix (`getScreenCTM()`): the length of the y axis. */
  const svgScale = (ctm) => {
    if (!ctm) return 1;
    const s = Math.hypot(ctm.c, ctm.d);
    return s > 0 && Number.isFinite(s) ? s : 1;
  };

  return { cssLength, parseTranslate, parseMatrix, transformedBounds, pseudoBox, unionBoxes, sizeOf, effectiveSize, paintedScale, svgScale };
}

export const { cssLength, parseTranslate, parseMatrix, transformedBounds, pseudoBox, unionBoxes, sizeOf, effectiveSize, paintedScale, svgScale } = geometryKit();

/** The source the page evaluates to get the kit: `(function geometryKit() {...})()`. */
export const GEOMETRY_SOURCE = `(${geometryKit.toString()})()`;
