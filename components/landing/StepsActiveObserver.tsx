"use client";

import { useEffect } from "react";
import { follow, reachedStep, stepProgress } from "./stepsProgress";

/** The same gate as the enhanced `.steps-*` layout in app/globals.css. */
const ENHANCED = "(min-width: 1024px) and (prefers-reduced-motion: no-preference)";

/**
 * Drives the "Cómo funciona" pile from the scroll position (wide screens).
 * It writes on the root:
 *
 *  - `--p2`, `--p3`: how far the screens of steps 2 and 3 have come onto the
 *    pile, 0..1. A screen starts to appear when its step's title enters at
 *    the bottom of the viewport and is in place when the title is in the
 *    middle (rules in ./stepsProgress.ts).
 *  - `data-active="1|2|3"`: the last step whose screen has settled.
 *
 * Every visual consequence is static CSS (app/globals.css, `.steps-*`).
 * Renders nothing and needs no translations. The page scrolls normally:
 * this only reads the scroll position, it never changes it.
 */
export default function StepsActiveObserver({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const titles = [2, 3]
      .map((n) => root.querySelector<HTMLElement>(`[data-step="${n}"] h3`))
      .filter((el): el is HTMLElement => el !== null);
    if (titles.length === 0) return;

    const enhanced = window.matchMedia(ENHANCED);
    const target = titles.map(() => 0);
    const current = titles.map(() => 0);
    let raf = 0;
    let last = 0;

    const measure = () => {
      const h = window.innerHeight;
      titles.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        target[i] = stepProgress(rect.top + rect.height / 2, h);
      });
    };

    const write = () => {
      current.forEach((p, i) => root.style.setProperty(`--p${i + 2}`, p.toFixed(4)));
      const step = String(reachedStep(current));
      if (root.dataset.active !== step) root.dataset.active = step;
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = last ? now - last : 16;
      last = now;
      let moving = false;
      current.forEach((p, i) => {
        current[i] = follow(p, target[i], dt);
        if (current[i] !== target[i]) moving = true;
      });
      write();
      if (moving) raf = requestAnimationFrame(tick);
      else last = 0;
    };

    const onScroll = () => {
      if (!enhanced.matches) return;
      measure();
      if (!raf) raf = requestAnimationFrame(tick);
    };

    // First paint (and a restored scroll position): no animation, the pile
    // simply is where the page is.
    const place = () => {
      if (!enhanced.matches) return;
      measure();
      target.forEach((p, i) => (current[i] = p));
      write();
    };

    place();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", place);
    enhanced.addEventListener("change", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", place);
      enhanced.removeEventListener("change", place);
    };
  }, [rootId]);

  return null;
}
