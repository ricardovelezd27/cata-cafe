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

        // Count-up numerals. Final formatted value is already in SSR HTML;
        // we parse it, animate from 0 and restore the exact original string.
        gsap.utils.toArray<HTMLElement>("[data-counter]").forEach((el) => {
          const original = el.textContent ?? "";
          const match = original.match(/^([^\d−-]*)([\d.,]+)(.*)$/);
          if (!match) return;
          const [, prefix, num, suffix] = match;
          const target = parseFloat(num.replace(/[.,](?=\d{3})/g, "").replace(",", "."));
          if (!Number.isFinite(target)) return;
          const fmt = new Intl.NumberFormat(document.documentElement.lang || "es");
          const obj = { v: 0 };
          ScrollTrigger.create({
            trigger: el,
            start: "top 88%",
            once: true,
            onEnter: () =>
              gsap.to(obj, {
                v: target,
                duration: 1.0,
                ease: "power2.out",
                onUpdate: () => {
                  el.textContent = `${prefix}${fmt.format(Math.round(obj.v))}${suffix}`;
                },
                onComplete: () => {
                  el.textContent = original;
                },
              }),
          });
        });

        // Roadmap line draw.
        const line = document.querySelector<HTMLElement>("[data-roadmap-line]");
        if (line) {
          gsap.set(line, { scaleX: 0, transformOrigin: "left center" });
          ScrollTrigger.create({
            trigger: line,
            start: "top 85%",
            once: true,
            onEnter: () =>
              gsap.to(line, { scaleX: 1, duration: 1.2, ease: "power2.inOut" }),
          });
        }
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
