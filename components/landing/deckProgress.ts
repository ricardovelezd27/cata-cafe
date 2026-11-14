/**
 * Pure rules of the phone "scroll stage" (ScrollDeck.tsx, `.deck-*` CSS).
 *
 * A section becomes a tall TRACK with one STAGE that stays under the top bar
 * while the track scrolls past. The scroll is the timeline: `t` goes from 0
 * (the stage has just stuck) to 1 (it is about to let go), and the cards come
 * in one by one along it. No DOM here.
 */

export const DECK = {
  /** Where the stage sticks: the height of the site header, in px. */
  stickTop: 60,
  /**
   * Share of a card's stretch of scroll spent arriving. The rest is a pause
   * with the card in place, so each one can be read before the next moves.
   */
  enter: 0.7,
  /** The pile of app screens is never drawn smaller than this. */
  minFit: 0.72,
  /** Room above the front screen for the labelled edges of the two behind it, in px. */
  pileHeadroom: 72,
  /** Room at the sides for the screens behind, which step out sideways, in px. */
  pileSideRoom: 16,
} as const;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Ease in and out: a card starts gently and lands gently. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * How far the stage has travelled along its track, 0..1.
 * `trackTop` is the track's top edge measured from the top of the viewport;
 * `travel` is how far the track can scroll while the stage is stuck (track
 * height minus stage height).
 */
export function deckTrackProgress(
  trackTop: number,
  travel: number,
  stickTop: number = DECK.stickTop,
): number {
  if (!(travel > 0) || !Number.isFinite(trackTop)) return 0;
  return clamp01((stickTop - trackTop) / travel);
}

/**
 * How far each card has come in, 0..1, for `count` cards at track progress
 * `t`. The first card is always in. Card `i` arrives during the first
 * `DECK.enter` share of stretch `i - 1` and then rests.
 */
export function deckEntries(t: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  const at = clamp01(Number.isFinite(t) ? t : 0) * (n - 1);
  const entries = [1];
  for (let i = 1; i < n; i++) {
    entries.push(smoothstep(clamp01((at - (i - 1)) / DECK.enter)));
  }
  return entries;
}

/**
 * How far behind the front each card is: the sum of the entries of the cards
 * after it. 0 for the front card, 1 for the one right behind it, and so on,
 * fractional while a card is arriving.
 */
export function deckBehind(entries: readonly number[]): number[] {
  const behind = new Array<number>(entries.length).fill(0);
  let sum = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    behind[i] = sum;
    sum += entries[i];
  }
  return behind;
}

/**
 * Which card the stage is showing, 1..n: one more for each later card that
 * is at least halfway in, in order. The text and the progress rail change at
 * that halfway point, so they move together with the card.
 */
export function deckActive(entries: readonly number[]): number {
  let active = 1;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i] < 0.5) break;
    active++;
  }
  return active;
}

/**
 * Where a constellation anchor for card `index` sits, in px from the top of
 * the track: the point that is in the middle of the viewport at the moment
 * that card has landed. Lets the dots change formation in step with the cards
 * although the cards themselves do not move down the page.
 */
export function deckFoldOffset(
  index: number,
  count: number,
  travel: number,
  viewportH: number,
  stickTop: number = DECK.stickTop,
): number {
  const n = Math.max(1, Math.floor(count));
  const landed = index <= 0 || n < 2 ? 0 : clamp01((index - 1 + DECK.enter) / (n - 1));
  return landed * Math.max(0, travel) - stickTop + viewportH / 2;
}

/**
 * The scale at which a pile of app screens of `natural` size fits the room it
 * was given, or `null` when even the smallest allowed size does not fit (the
 * section then keeps its plain layout).
 */
export function pileFit(
  areaW: number,
  areaH: number,
  natural: { w: number; h: number },
): number | null {
  const byHeight = areaH / (natural.h + DECK.pileHeadroom);
  const byWidth = areaW / (natural.w + DECK.pileSideRoom);
  const fit = Math.min(1, byHeight, byWidth);
  if (!(fit >= DECK.minFit)) return null;
  return fit;
}
