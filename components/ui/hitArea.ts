/**
 * A 44 px hit area for a control that keeps its visible size (DESIGN.md
 * "Accessibility": touch targets are measured as painted; a smaller visible
 * control gets a 44 px hit area through a transparent `::before`, as the
 * intensity slider does).
 *
 * Use it only where growing the visible control would break a dense row (a
 * docked bar, a segment inside its track). Everywhere else the control itself
 * paints 44 px (`min-h-[44px]`). The class lists are literal strings so
 * Tailwind sees them; the control must not set `position` itself.
 */

/** 44 px tall, as wide as the control: for controls that sit side by side
 *  (segments, tabs), so a hit area never reaches into a neighbour. */
export const HIT_Y44 =
  "relative before:absolute before:inset-x-0 before:top-1/2 before:h-[44px] before:-translate-y-1/2 before:content-['']";

/** 44 x 44 px at least, centred: for a lone control with room around it. */
export const HIT_44 =
  "relative before:absolute before:left-1/2 before:top-1/2 before:h-[max(100%,44px)] before:w-[max(100%,44px)] before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";
