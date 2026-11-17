import type { KeyboardEvent } from "react";

/**
 * The keyboard of a radio group (WAI-ARIA radio group pattern), as a pure rule:
 * which option a key moves to from option `index` of `count`. Arrow keys wrap
 * around; Home and End go to the ends; any other key moves nothing (null).
 */
export function nextRadioIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * onKeyDown for a `role="radio"` button inside a `role="radiogroup"` (N3): the
 * arrows, Home and End check the next option and move focus to it, as native
 * radio buttons do. The radios are found in the DOM of the group, so a caller
 * needs no refs. Only the checked option should be a Tab stop
 * (`tabIndex={checked ? 0 : -1}`).
 */
export function radioKeyDown(
  event: KeyboardEvent<HTMLElement>,
  index: number,
  count: number,
  select: (index: number) => void,
): void {
  const next = nextRadioIndex(event.key, index, count);
  if (next === null) return;
  event.preventDefault();
  select(next);
  const group = event.currentTarget.closest('[role="radiogroup"]');
  const radios = group?.querySelectorAll<HTMLElement>('[role="radio"]');
  radios?.[next]?.focus();
}
