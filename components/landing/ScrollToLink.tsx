"use client";

import type { MouseEvent, ReactNode } from "react";

/** Height of the sticky site header, plus a little air above the target. */
const OFFSET = 60 + 16;

/**
 * A link to a place further down the same page ("Reserva tu plaza" in the
 * hero goes to the founding card, the one form on the page).
 *
 * It is a real `#id` link, so it works with no script. With script it does
 * three things a bare anchor does not:
 *  - lays out every section first (`data-cv-visible`): sections with
 *    `.cv-auto` have a placeholder height until first drawn, and the target
 *    would otherwise be measured in the wrong place;
 *  - JUMPS there. Not a smooth scroll: on a phone the way down passes three
 *    pinned stages, and a fast scroll through them would play every card;
 *  - on arrival puts the cursor in the target's field (`focus`), but only
 *    where there is a real keyboard: on a touch screen the on-screen
 *    keyboard would cover the card the person has just arrived at.
 */
export default function ScrollToLink({
  targetId,
  focus,
  className,
  children,
}: {
  targetId: string;
  /** CSS selector, inside the target, of the element to focus on arrival. */
  focus?: string;
  className?: string;
  children: ReactNode;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // A new tab, a new window: the browser's business.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = document.getElementById(targetId);
    if (!target) return;
    event.preventDefault();

    const root = document.documentElement;
    root.setAttribute("data-cv-visible", "");
    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - OFFSET);
    window.scrollTo({ top, behavior: "instant" });
    if (focus && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      target.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
    }
    requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute("data-cv-visible")));
  };

  return (
    <a href={`#${targetId}`} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
