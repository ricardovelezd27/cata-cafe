/**
 * The paper card's recipe, in a module with NO "use client", so a server component can call
 * `cardClasses()` (a function exported from a client module cannot run on the server).
 * `Card` (components/ui/Card.tsx) builds from the same constants: one recipe, two ways in.
 */

export type CardTone = "default" | "quiet" | "selected";
export type CardPadding = "regular" | "compact" | "row";

export const CARD_TONE: Record<CardTone, string> = {
  default: "bg-surface-container-lowest",
  quiet: "bg-surface-container-low",
  selected: "bg-primary-fixed",
};
export const CARD_PADDING: Record<CardPadding, string> = {
  regular: "p-[16px] md:p-[20px]",
  compact: "p-[16px]",
  row: "px-[16px] py-[12px]",
};
export const CARD_FRAME = "rounded-card border border-outline-variant text-on-surface";
// Only the ground transitions: `transition-colors` would also fade the focus ring in from
// the text colour (Tailwind v4 includes outline-color), so the ring is green at once.
export const CARD_INTERACTIVE =
  "block w-full text-left transition-[background-color] hover:bg-surface-container-high disabled:cursor-default disabled:opacity-60";

/** The card recipe for a wrapper that renders its own element (GuestGateLink), as buttonClasses(). */
export function cardClasses({
  tone = "default",
  padding = "regular",
  interactive = false,
}: { tone?: CardTone; padding?: CardPadding; interactive?: boolean } = {}): string {
  return `${CARD_FRAME} ${CARD_TONE[tone]} ${CARD_PADDING[padding]}${interactive ? ` ${CARD_INTERACTIVE}` : ""}`;
}
