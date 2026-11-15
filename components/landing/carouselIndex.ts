/**
 * Which card of a sideways scroll-snap list is the one being read.
 *
 * `step` is one card's width plus the gap. On a wide phone two cards can be
 * in view at once, so the list stops scrolling before the last card reaches
 * the left edge: `atEnd` says the list cannot scroll further, and the last
 * card is then the current one (otherwise its number would never light).
 */
export function carouselIndex(
  scrollLeft: number,
  step: number,
  total: number,
  atEnd: boolean,
): number {
  const n = Math.max(1, Math.floor(total));
  if (!(step > 0) || !Number.isFinite(scrollLeft)) return 0;
  if (atEnd && scrollLeft > 1) return n - 1;
  return Math.min(n - 1, Math.max(0, Math.round(scrollLeft / step)));
}

/** Below this width the landing is the phone layout; from it, the desktop one. */
export const PHONE_MAX = "(max-width: 767.98px)";
