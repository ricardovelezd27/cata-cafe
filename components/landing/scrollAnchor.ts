/**
 * Keeping the reader's place when the page's text changes under them (the
 * language switch). A pixel offset is not a place: the same text is longer in
 * one language than in the other, so the same offset can land in a different
 * section. The place is "this section, this far through it".
 *
 * Pure; LocaleSwitch.tsx does the measuring and the scrolling.
 */

export type ScrollAnchor = {
  /** Which section, by its position among the page's sections. */
  index: number;
  /** How far through that section the reading line is, 0..1. */
  ratio: number;
};

/**
 * The reading line, in px from the top of the viewport: just under the 60px
 * site header, where the eye is when a section has been scrolled to.
 */
export const ANCHOR_LINE = 80;

/**
 * The section the reading line is in, and how far through it. `sections` are
 * in page order, measured from the top of the viewport. `null` when there is
 * nothing to hold on to.
 */
export function pickAnchor(
  sections: readonly { top: number; height: number }[],
  line: number = ANCHOR_LINE,
): ScrollAnchor | null {
  let index = -1;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].top <= line) index = i;
    else break;
  }
  if (index < 0) return sections.length > 0 ? { index: 0, ratio: 0 } : null;
  const { top, height } = sections[index];
  const ratio = height > 0 ? Math.min(1, Math.max(0, (line - top) / height)) : 0;
  return { index, ratio };
}

/**
 * The scroll position that puts the reading line `ratio` of the way through a
 * section. `pageTop` is the section's top measured from the top of the page.
 */
export function anchorScrollTop(
  pageTop: number,
  height: number,
  ratio: number,
  line: number = ANCHOR_LINE,
): number {
  return Math.max(0, pageTop + Math.min(1, Math.max(0, ratio)) * Math.max(0, height) - line);
}
