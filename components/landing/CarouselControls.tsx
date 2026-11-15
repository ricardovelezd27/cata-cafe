"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PHONE_MAX, carouselIndex } from "./carouselIndex";

type CarouselState = { index: number; atStart: boolean; atEnd: boolean };

/** One card's width plus the gap of a scroll-snap list. */
function stepOf(list: HTMLElement): number {
  const first = list.firstElementChild as HTMLElement | null;
  if (!first) return 0;
  const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
  return first.offsetWidth + gap;
}

/**
 * Reads how far a CSS scroll-snap list has scrolled. The list itself is
 * server-rendered and scrolls by touch, wheel and keyboard without this.
 */
function useCarousel(listId: string, total: number): CarouselState {
  const [state, setState] = useState<CarouselState>({ index: 0, atStart: true, atEnd: false });

  useEffect(() => {
    const list = document.getElementById(listId);
    if (!list) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const atStart = list.scrollLeft <= 1;
      const atEnd = list.scrollLeft >= list.scrollWidth - list.clientWidth - 1;
      const index = carouselIndex(list.scrollLeft, stepOf(list), total, atEnd);
      setState((prev) =>
        prev.index === index && prev.atStart === atStart && prev.atEnd === atEnd
          ? prev
          : { index, atStart, atEnd },
      );
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    schedule();
    list.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      list.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [listId, total]);

  return state;
}

/**
 * Previous / next buttons for a sideways list, from 768px up (the desktop
 * layout). A phone has no arrows: the list is swiped, and `CarouselSteps`
 * under it says which card is showing.
 */
export default function CarouselControls({
  listId,
  total,
  labels,
}: {
  listId: string;
  total: number;
  labels: { prev: string; next: string };
}) {
  const state = useCarousel(listId, total);

  const move = (direction: 1 | -1) => {
    const list = document.getElementById(listId);
    if (!list) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollBy({ left: direction * stepOf(list), behavior: reduced ? "auto" : "smooth" });
  };

  const button =
    "inline-flex h-[44px] w-[44px] items-center justify-center rounded-full border border-surface/25 text-surface transition-colors hover:bg-surface/10 disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        aria-label={labels.prev}
        aria-controls={listId}
        disabled={state.atStart}
        onClick={() => move(-1)}
        className={button}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={labels.next}
        aria-controls={listId}
        disabled={state.atEnd}
        onClick={() => move(1)}
        className={button}
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The progress of a sideways list on a phone: one NUMBERED step per card, in
 * a row under the list (the list moves sideways, so its progress runs
 * sideways), the card being read lit. Same recipe as the vertical rail of
 * "Cómo funciona" (`.rail-step`). Decorative: the list is a real list and
 * announces "item 2 of 6" by itself.
 *
 * It also makes the list focusable while it is a sideways scroller (Safari
 * does not focus a scroll container on its own), and only then: from 768px
 * some lists are a plain grid, which must not be a stop for the Tab key.
 */
export function CarouselSteps({
  listId,
  total,
  focusable = false,
}: {
  listId: string;
  total: number;
  /** Set when the list is a grid from 768px up (it then has no tabindex of its own). */
  focusable?: boolean;
}) {
  const { index } = useCarousel(listId, total);

  useEffect(() => {
    if (!focusable) return;
    const list = document.getElementById(listId);
    if (!list) return;
    const phone = window.matchMedia(PHONE_MAX);
    const apply = () => {
      if (phone.matches) list.setAttribute("tabindex", "0");
      else list.removeAttribute("tabindex");
    };
    apply();
    phone.addEventListener("change", apply);
    return () => {
      phone.removeEventListener("change", apply);
      list.removeAttribute("tabindex");
    };
  }, [listId, focusable]);

  return (
    <div aria-hidden="true" className="mt-4 flex items-center justify-center gap-2 md:hidden">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="rail-step" data-on={i === index ? "1" : undefined}>
          {i + 1}
        </span>
      ))}
    </div>
  );
}
