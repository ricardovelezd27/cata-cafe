"use client";

import { useEffect } from "react";

/**
 * Sole GSAP entry point for the landing page. Motion is an enhancement:
 * SSR markup is fully visible; elements are hidden only after GSAP loads,
 * and only below the fold. Bails out entirely on prefers-reduced-motion.
 */
export default function ScrollFx() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let ctx: { revert: () => void } | undefined;
    let safety: ReturnType<typeof setInterval> | undefined;

    const start = async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      // content-visibility placeholders and late font swaps shift layout;
      // re-measure trigger positions once fonts settle.
      document.fonts?.ready.then(() => {
        if (!cancelled) ScrollTrigger.refresh();
      });

      const hidden = new Set<HTMLElement>();

      ctx = gsap.context(() => {
        // Hero entrance is pure CSS (.hero-rise / .hero-slide) so the LCP
        // paint is never delayed by this lazy-loaded module.

        const show = (el: HTMLElement) => {
          hidden.delete(el);
          gsap.to(el, {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: "power3.out",
            clearProps: "all",
          });
        };

        // Section reveals.
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
          const fromBelowViewport =
            el.getBoundingClientRect().top > window.innerHeight * 0.85;
          if (!fromBelowViewport) return;
          gsap.set(el, { opacity: 0, y: 32 });
          hidden.add(el);
          ScrollTrigger.create({
            trigger: el,
            start: "top 85%",
            once: true,
            onEnter: () => show(el),
          });
        });

        // Safety net: if a hidden element is inside the viewport but its
        // trigger never fired (mis-measured layout, snapshot renderers,
        // print), reveal it anyway. Off-screen elements keep their reveal.
        safety = setInterval(() => {
          hidden.forEach((el) => {
            if (el.getBoundingClientRect().top < window.innerHeight) show(el);
          });
          if (hidden.size === 0 && safety) clearInterval(safety);
        }, 1500);

        // No count-up numerals: an offer ("100") or a fact ("3 hojas") must
        // never show a wrong number while it animates.
      });
    };

    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void) => number;
    };
    const w = window as IdleWindow;
    if (w.requestIdleCallback) w.requestIdleCallback(() => void start());
    else setTimeout(() => void start(), 200);

    return () => {
      cancelled = true;
      if (safety) clearInterval(safety);
      ctx?.revert();
    };
  }, []);

  return null;
}
