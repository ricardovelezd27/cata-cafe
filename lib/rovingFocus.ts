// The keyboard of a row of choices (audit H-08, package P5a): tabs and radio
// groups are ONE Tab stop, and the arrow keys, Home and End move inside them.
// Pure, no DOM: `components/ui/PillTabs.tsx` and `SegmentedControl.tsx` read it.
//
// - ArrowRight / ArrowDown: the next enabled item, wrapping to the first.
// - ArrowLeft / ArrowUp: the previous enabled item, wrapping to the last.
// - Home / End: the first / last enabled item.
// - Any other key, or a row with no enabled item: null (the key is not ours).
//
// The item that holds the Tab stop is the selected one, or the first enabled
// item when nothing is selected (`tabStopIndex`).

export type RovingKey = "ArrowRight" | "ArrowLeft" | "ArrowDown" | "ArrowUp" | "Home" | "End";

const ROVING_KEYS: readonly string[] = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];

export function isRovingKey(key: string): key is RovingKey {
  return ROVING_KEYS.includes(key);
}

/** The index the key moves to, or null when the key is not one of ours or nothing can take focus. */
export function nextRovingIndex(key: string, current: number, disabled: readonly boolean[]): number | null {
  if (!isRovingKey(key)) return null;
  const count = disabled.length;
  const enabled = disabled.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
  if (enabled.length === 0) return null;
  if (key === "Home") return enabled[0];
  if (key === "End") return enabled[enabled.length - 1];
  const step = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
  for (let k = 1; k <= count; k++) {
    const i = (((current + step * k) % count) + count) % count;
    if (!disabled[i]) return i;
  }
  return null;
}

/** The one item that is in the Tab order: the selected one, else the first enabled one (-1: none). */
export function tabStopIndex(selected: number, disabled: readonly boolean[]): number {
  if (selected >= 0 && selected < disabled.length && !disabled[selected]) return selected;
  return disabled.findIndex((d) => !d);
}

/** The ids that tie a tab to its panel (`aria-controls` / `aria-labelledby`). */
export function tabIds(idBase: string, id: string): { tab: string; panel: string } {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, "_");
  return { tab: `${idBase}-tab-${safe}`, panel: `${idBase}-panel-${safe}` };
}
