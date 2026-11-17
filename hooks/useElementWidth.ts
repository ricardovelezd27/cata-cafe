"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * The width of an element, kept current for as long as it is mounted.
 *
 * For a drawing whose TEXT must paint at a fixed size whatever the scale of the
 * drawing (the flavour wheel): its layout is computed from this width, so a
 * stale width paints its words too small or too large. hooks/useContainerWidth.ts
 * re-measures on a window resize only, one frame late; that misses a column
 * that changes width by itself (a rail that opens, a sheet that slides in) and
 * leaves one painted frame where the layout and the width disagree.
 *
 * So this hook watches the ELEMENT (a ResizeObserver, whose callback runs after
 * layout and before paint: every painted frame is consistent), with the same
 * first measure in a layout effect. Three guards against the failures the other
 * hook's note records for a chart library's own observer:
 *   - only the WIDTH is read, and nothing the caller draws changes it (the
 *     drawing is as wide as its box), so the observer cannot feed itself;
 *   - a width of 0 (a hidden tab, a cell not yet revealed) is ignored: the last
 *     real width stays until the element has one again;
 *   - the state is set only when the rounded width changes.
 * Without ResizeObserver it falls back to the window's resize.
 *
 * Until the first measure `width` is 0: the caller draws at its own default.
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = (value: number) => {
      const next = Math.round(value);
      if (next > 0) setWidth((prev) => (prev === next ? prev : next));
    };
    apply(el.clientWidth);

    if (typeof ResizeObserver === "undefined") {
      let raf = 0;
      const onResize = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => apply(el.clientWidth));
      };
      window.addEventListener("resize", onResize);
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
      };
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
