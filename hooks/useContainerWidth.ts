"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Measures the container width with useLayoutEffect (runs after layout, before
 * paint — so width is correct the first time the chart mounts) plus a
 * rAF-debounced resize/orientation listener.
 *
 * This replaces Recharts' ResponsiveContainer, whose ResizeObserver-based
 * measurement freezes on iOS Safari when the chart mounts into a grid cell that
 * was just revealed by a tab switch (measures width 0 and gets stuck, or trips
 * the "ResizeObserver loop" that locks the main thread). Measuring manually
 * sidesteps that entirely and renders identically on desktop.
 *
 * (Same pattern as the hook local to components/results/SampleRadarChart.tsx.)
 */
export function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => setWidth(el.clientWidth);
    measure();

    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return { ref, width };
}
