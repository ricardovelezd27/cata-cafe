"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { edgeHint, type EdgeHint } from "@/lib/viewAddress";

/**
 * The hint that a sideways row has more (P5a's fade with a chevron, as `RouteTabs` draws it;
 * P5b, audit D-04): which edge of the scroller has more behind it, kept current on scroll and
 * resize. Pure maths in `lib/viewAddress.ts` (`edgeHint`).
 */
export function useEdgeHint(ref: RefObject<HTMLElement | null>, deps: readonly unknown[] = []): EdgeHint {
  const [hint, setHint] = useState<EdgeHint>({ start: false, end: false });
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const read = () => setHint(edgeHint(row.scrollLeft, row.scrollWidth, row.clientWidth));
    read();
    row.addEventListener("scroll", read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(row);
    return () => {
      row.removeEventListener("scroll", read);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read when the caller's row changes
  }, deps);
  return hint;
}

/** The two fades, placed by the caller inside a `relative` box around the scroller. */
export function EdgeFades({ hint }: { hint: EdgeHint }) {
  return (
    <>
      {hint.start ? (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 flex w-8 items-center bg-gradient-to-r from-surface via-surface to-transparent text-on-surface-variant" data-edge="start">
          <ChevronLeft size={14} />
        </span>
      ) : null}
      {hint.end ? (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-end bg-gradient-to-l from-surface via-surface to-transparent text-on-surface-variant" data-edge="end">
          <ChevronRight size={14} />
        </span>
      ) : null}
    </>
  );
}
