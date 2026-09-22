"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { isKilled } from "./flags";

// `ssr: false` is only allowed inside a Client Component (Next 16), which is
// why this wrapper exists: the page (a Server Component) renders it, and the
// engine chunk is fetched only here, only in the browser, only after idle.
const ConstellationCanvas = dynamic(() => import("./ConstellationCanvas"), {
  ssr: false,
});

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

export default function ConstellationMount() {
  const [armed, setArmed] = useState<{ reduced: boolean } | null>(null);

  useEffect(() => {
    if (isKilled()) return;
    const reduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      (process.env.NODE_ENV !== "production" && window.location.search.includes("rm=1"));

    let cancelled = false;
    const arm = () => {
      if (!cancelled) setArmed({ reduced });
    };
    // Never compete with the hero paint: wait for the load event, then for an
    // idle slot (same gate as ScrollFx), with a hard timeout so it always arms.
    const whenIdle = () => {
      const w = window as IdleWindow;
      if (w.requestIdleCallback) w.requestIdleCallback(arm, { timeout: 2500 });
      else window.setTimeout(arm, 1200);
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", whenIdle);
    };
  }, []);

  return armed ? <ConstellationCanvas reduced={armed.reduced} /> : null;
}
