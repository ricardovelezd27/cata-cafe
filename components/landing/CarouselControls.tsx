"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Counter ("01 / 05", phones) and previous / next buttons (wider screens)
 * for a CSS scroll-snap list. The list itself is server-rendered and scrolls
 * without this component; this only reads how far it has scrolled and moves
 * it by one card on a click. The counter is decorative: the list already
 * announces "item 2 of 5" to a screen reader.
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
  const [state, setState] = useState({ index: 0, atStart: true, atEnd: false });

  useEffect(() => {
    const list = document.getElementById(listId);
    if (!list) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const first = list.firstElementChild as HTMLElement | null;
      if (!first) return;
      const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
      const step = first.offsetWidth + gap;
      const index = Math.min(total - 1, Math.max(0, Math.round(list.scrollLeft / step)));
      const atStart = list.scrollLeft <= 1;
      const atEnd = list.scrollLeft >= list.scrollWidth - list.clientWidth - 1;
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

  const move = (direction: 1 | -1) => {
    const list = document.getElementById(listId);
    const first = list?.firstElementChild as HTMLElement | null;
    if (!list || !first) return;
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollBy({
      left: direction * (first.offsetWidth + gap),
      behavior: reduced ? "auto" : "smooth",
    });
  };

  const two = (n: number) => String(n).padStart(2, "0");
  const button =
    "inline-flex h-[44px] w-[44px] items-center justify-center rounded-full border border-surface/25 text-surface transition-colors hover:bg-surface/10 disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <div className="flex shrink-0 items-center gap-3">
      {/* One card per screen on a phone, so "which card" is exact there. */}
      <p aria-hidden="true" className="whitespace-nowrap font-serif tabular-nums text-base text-surface/80 sm:hidden">
        <span className="text-lg text-secondary-container">{two(state.index + 1)}</span>
        {" / "}
        {two(total)}
      </p>
      <div className="hidden items-center gap-2 sm:flex">
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
    </div>
  );
}
