"use client";

import { useLayoutEffect } from "react";
import {
  deckActive,
  deckBehind,
  deckEntries,
  deckFoldOffset,
  deckTrackProgress,
  pileFit,
} from "./deckProgress";
import { follow } from "./stepsProgress";

/** Phones only, and never against a reduced-motion setting. */
const PHONE = "(max-width: 639px) and (prefers-reduced-motion: no-preference)";

/** Size the pile of app screens was drawn at (`.steps-pile-stack`). */
const PILE = { w: 320, h: 300 };

/**
 * The phone "scroll stage". Turns a `[data-deck]` section into a tall track
 * whose stage (`.deck-stage`: the section header, a progress rail and the
 * cards) stays under the top bar while the cards come in one by one as the
 * page scrolls. The page scrolls normally: this only reads the position.
 *
 * It writes, and only while the stage is on:
 *  - `data-deck-on` and `--deck-n` on the root (the CSS does the layout);
 *  - `--e` (how far in, 0..1) and `--b` (how far behind the front) on every
 *    `[data-deck-card]`;
 *  - `data-active="1..n"` on the root (the card being shown), `data-on` on
 *    the rail dots that are reached and `--f` on the rail lines;
 *  - where the constellation's anchors sit (`[data-deck-fold]`).
 *
 * The stage is switched on only when it fits. `data-deck` says how to tell:
 *  - "pile": app screens that scale down a little (`--deck-fit`);
 *  - "swap": every card must fit the room at its natural height;
 *  - "fill": cards take the room they get; `data-deck-min` is the least.
 * When it does not fit (a short phone), or on a wide screen, with reduced
 * motion or without script, the section keeps its plain layout.
 */
export default function ScrollDeck({ rootId }: { rootId: string }) {
  // A layout effect: the stage is decided before the browser paints, so the
  // plain layout never flashes first, and a scroll position restored in the
  // same commit (LocaleSwitch) is computed on the final layout.
  useLayoutEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const stage = root.querySelector<HTMLElement>(".deck-stage");
    const area = root.querySelector<HTMLElement>("[data-deck-area]");
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-deck-card]"));
    if (!stage || !area || cards.length < 2) return;

    const count = cards.length;
    const mode = root.dataset.deck || "swap";
    const minArea = Number(root.dataset.deckMin) || 0;
    const dots = Array.from(root.querySelectorAll<HTMLElement>("[data-deck-dot]"));
    const lines = Array.from(root.querySelectorAll<HTMLElement>("[data-deck-line]"));
    const markers = Array.from(root.querySelectorAll<HTMLElement>("[data-deck-fold]"));
    // The anchors the constellation uses in the plain layout. While the stage
    // is on, the markers along the track take over.
    const plainFolds = Array.from(root.querySelectorAll<HTMLElement>("[data-fold]")).map(
      (el) => ({ el, fold: el.dataset.fold ?? "" }),
    );

    const phone = window.matchMedia(PHONE);
    const target: number[] = cards.map((_, i) => (i === 0 ? 1 : 0));
    const current = target.slice();
    let on = false;
    let lastWidth = -1;
    let lastMatches: boolean | null = null;
    let raf = 0;
    let last = 0;

    const travel = () => root.offsetHeight - stage.offsetHeight;

    const write = () => {
      const behind = deckBehind(current);
      cards.forEach((card, i) => {
        card.style.setProperty("--e", current[i].toFixed(4));
        card.style.setProperty("--b", behind[i].toFixed(4));
      });
      const step = deckActive(current);
      const active = String(step);
      if (root.dataset.active !== active) root.dataset.active = active;
      dots.forEach((dot, i) => {
        if (i < step) dot.dataset.on = "1";
        else delete dot.dataset.on;
      });
      lines.forEach((line, i) => {
        line.style.setProperty("--f", (current[i + 1] ?? 0).toFixed(4));
      });
    };

    const measure = () => {
      const t = deckTrackProgress(root.getBoundingClientRect().top, travel());
      deckEntries(t, count).forEach((e, i) => (target[i] = e));
    };

    const placeFolds = () => {
      const room = travel();
      markers.forEach((marker, i) => {
        marker.style.top = `${deckFoldOffset(i, count, room, window.innerHeight).toFixed(1)}px`;
      });
    };

    const fits = (): boolean => {
      const h = area.clientHeight;
      if (h < minArea) return false;
      if (mode === "pile") {
        const fit = pileFit(area.clientWidth, h, PILE);
        if (fit === null) return false;
        root.style.setProperty("--deck-fit", fit.toFixed(3));
        return true;
      }
      if (mode === "swap") return cards.every((card) => card.offsetHeight <= h + 1);
      return true;
    };

    const turnOff = () => {
      if (!on) return;
      on = false;
      cancelAnimationFrame(raf);
      raf = 0;
      root.removeAttribute("data-deck-on");
      root.style.removeProperty("--deck-n");
      root.style.removeProperty("--deck-fit");
      delete root.dataset.active;
      cards.forEach((card) => {
        card.style.removeProperty("--e");
        card.style.removeProperty("--b");
      });
      lines.forEach((line) => line.style.removeProperty("--f"));
      markers.forEach((marker) => marker.removeAttribute("data-fold"));
      plainFolds.forEach(({ el, fold }) => el.setAttribute("data-fold", fold));
    };

    const turnOn = () => {
      // The values first, the layout second: a card must never be drawn with
      // the CSS defaults (all of them in place, on top of each other).
      write();
      root.style.setProperty("--deck-n", String(count));
      root.setAttribute("data-deck-on", "");
      on = true;
      if (!fits()) {
        turnOff();
        return;
      }
      plainFolds.forEach(({ el }) => el.removeAttribute("data-fold"));
      markers.forEach((marker) => {
        marker.setAttribute("data-fold", marker.dataset.deckFold ?? "");
      });
      placeFolds();
      // No animation on arrival: the stage is where the page is.
      measure();
      target.forEach((e, i) => (current[i] = e));
      write();
    };

    // Re-decided only when the WIDTH changes (rotation, a resized window). A
    // phone's toolbar hiding changes the height on every scroll, and a layout
    // that switched then would make the page jump.
    const decide = () => {
      const width = window.innerWidth;
      const matches = phone.matches;
      if (width === lastWidth && matches === lastMatches) {
        if (on) placeFolds();
        return;
      }
      lastWidth = width;
      lastMatches = matches;
      turnOff();
      if (matches) turnOn();
    };

    const tick = (now: number) => {
      raf = 0;
      if (!on) return;
      const dt = last ? now - last : 16;
      last = now;
      let moving = false;
      current.forEach((e, i) => {
        current[i] = follow(e, target[i], dt);
        if (current[i] !== target[i]) moving = true;
      });
      write();
      if (moving) raf = requestAnimationFrame(tick);
      else last = 0;
    };

    const onScroll = () => {
      if (!on) return;
      measure();
      if (!raf) raf = requestAnimationFrame(tick);
    };

    decide();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", decide);
    phone.addEventListener("change", decide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", decide);
      phone.removeEventListener("change", decide);
      turnOff();
    };
  }, [rootId]);

  return null;
}
