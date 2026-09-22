"use client";

import { useEffect, useRef } from "react";
import { bracket, type FoldAnchor } from "./bracket";
import {
  FOLD_COUNT,
  PALETTE,
  buildFormation,
  seedIdentity,
  type Formation,
} from "./formations";
import { markKilled } from "./flags";
import { createGovernor } from "./governor";

/**
 * The landing page's single persistent particle field: one fixed full-viewport
 * canvas behind every section, eased between the per-fold formations in
 * ./formations.ts as the visitor scrolls (see ./README.md for the story).
 *
 * Performance contract (see the plan's budget table):
 *  - never in SSR; mounted on idle by ConstellationMount, first frame is a
 *    synchronous snap so a correct static image exists before any animation
 *  - N ≤ 1600 desktop / 600 mobile, DPR ≤ 1.5, zero per-frame allocation
 *  - adaptive governor: two 40 % count cuts on a slow frame budget, then a
 *    kill-switch that freezes the last frame and disables the field for the
 *    session (sessionStorage) so a weak device never pays twice
 *  - idle throttle: 30 fps after 4 s without input, paused after 12 s
 *  - prefers-reduced-motion: snapped static frame per fold, loop stops after
 *    settling, wakes on scroll only to crossfade
 */

type Props = { reduced: boolean };

const TOKEN_NAMES = [
  "--color-primary-fixed", // MINT
  "--color-secondary-container", // TERRA
  "--color-surface", // CREAM
  "--color-flavor-floral",
  "--color-flavor-fruity",
  "--color-flavor-sweet",
  "--color-flavor-sour",
  "--color-flavor-green",
  "--color-flavor-nutty",
  "--color-flavor-spice",
  "--color-flavor-roasted",
  "--color-flavor-other",
] as const;

// Snapshot of the app/globals.css token values, used ONLY if a token is missing
// at runtime (sanctioned exception, same as components/results/chartColors.ts).
const TOKEN_FALLBACK: Record<(typeof TOKEN_NAMES)[number], string> = {
  "--color-primary-fixed": "#c7ebd4",
  "--color-secondary-container": "#fd8c6a",
  "--color-surface": "#fff8f6",
  "--color-flavor-floral": "#b07d2f",
  "--color-flavor-fruity": "#c0552a",
  "--color-flavor-sweet": "#a07040",
  "--color-flavor-sour": "#ba1a1a",
  "--color-flavor-green": "#456553",
  "--color-flavor-nutty": "#6b5240",
  "--color-flavor-spice": "#8b5e3c",
  "--color-flavor-roasted": "#332f2a",
  "--color-flavor-other": "#5e5a55",
};

const BLEND_STEPS = 8;
// Governor watches the DRAW cost (ms spent inside step()), never the rAF
// interval: browsers throttle rAF to 30 Hz on their own (power saving, hidden
// panes, 30 Hz displays) and that must not read as "we are too slow".
const DRAW_BUDGET_MS = 8;
const GOVERNOR_WINDOW = 60;
const GOVERNOR_WARMUP = 90;
const MAX_DOWNGRADES = 2;
const IDLE_HALF_RATE_MS = 4000;
const IDLE_PAUSE_MS = 12000;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

type RGB = [number, number, number];

/** Resolve any CSS colour string to [r,g,b] via the canvas' own parser. */
function resolveRgb(ctx: CanvasRenderingContext2D, css: string, fallback: string): RGB {
  ctx.fillStyle = css || fallback;
  const norm = String(ctx.fillStyle);
  if (norm.startsWith("#") && norm.length >= 7) {
    return [
      parseInt(norm.slice(1, 3), 16),
      parseInt(norm.slice(3, 5), 16),
      parseInt(norm.slice(5, 7), 16),
    ];
  }
  const m = norm.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  ctx.fillStyle = fallback;
  return resolveRgb(ctx, fallback, "#ffffff");
}

function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * Palette (index → rgb + base alpha) for every PALETTE slot. Dark flavour
 * families would vanish under additive blend on the green stage, so anything
 * below a luminance floor is lifted toward cream while keeping its hue.
 */
function buildPalette(ctx: CanvasRenderingContext2D): { rgb: RGB[]; alpha: number[] } {
  const style = getComputedStyle(document.documentElement);
  const tok = (name: (typeof TOKEN_NAMES)[number]) =>
    resolveRgb(ctx, style.getPropertyValue(name).trim(), TOKEN_FALLBACK[name]);

  const mint = tok("--color-primary-fixed");
  const terra = tok("--color-secondary-container");
  const cream = tok("--color-surface");
  const rgb: RGB[] = new Array(PALETTE.length);
  const alpha: number[] = new Array(PALETTE.length);
  rgb[PALETTE.MINT] = mint; alpha[PALETTE.MINT] = 0.85;
  rgb[PALETTE.MINT_DIM] = mint; alpha[PALETTE.MINT_DIM] = 0.38;
  rgb[PALETTE.TERRA] = terra; alpha[PALETTE.TERRA] = 0.9;
  rgb[PALETTE.TERRA_DIM] = terra; alpha[PALETTE.TERRA_DIM] = 0.42;
  rgb[PALETTE.CREAM] = cream; alpha[PALETTE.CREAM] = 0.9;
  rgb[PALETTE.CREAM_DIM] = cream; alpha[PALETTE.CREAM_DIM] = 0.4;
  for (let k = 0; k < 9; k++) {
    let c = tok(TOKEN_NAMES[3 + k]);
    const lum = luminance(c);
    if (lum < 0.22) {
      const lift = 0.55;
      c = [
        Math.round(lerp(c[0], cream[0], lift)),
        Math.round(lerp(c[1], cream[1], lift)),
        Math.round(lerp(c[2], cream[2], lift)),
      ];
    }
    rgb[PALETTE.FLAVOR0 + k] = c;
    alpha[PALETTE.FLAVOR0 + k] = 0.85;
  }
  return { rgb, alpha };
}

/** rgba string LUT over (paletteA, paletteB, blendStep) — the hot loop never allocates. */
function buildLut(p: { rgb: RGB[]; alpha: number[] }): string[] {
  const K = PALETTE.length;
  const lut = new Array<string>(K * K * BLEND_STEPS);
  for (let a = 0; a < K; a++) {
    for (let b = 0; b < K; b++) {
      for (let s = 0; s < BLEND_STEPS; s++) {
        const t = s / (BLEND_STEPS - 1);
        const r = Math.round(lerp(p.rgb[a][0], p.rgb[b][0], t));
        const g = Math.round(lerp(p.rgb[a][1], p.rgb[b][1], t));
        const bb = Math.round(lerp(p.rgb[a][2], p.rgb[b][2], t));
        const al = lerp(p.alpha[a], p.alpha[b], t).toFixed(3);
        lut[(a * K + b) * BLEND_STEPS + s] = `rgba(${r},${g},${bb},${al})`;
      }
    }
  }
  return lut;
}

type DebugHandle = {
  live: number;
  n: number;
  fold: { a: number; b: number; blend: number };
  downgrades: number;
  killed: boolean;
  running: boolean;
  /** mean draw cost of the last evaluated governor window, ms */
  meanDt: number;
};

export default function ConstellationCanvas({ reduced }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // ── capacity ─────────────────────────────────────────────────────────────
    const mobile =
      window.matchMedia("(max-width: 768px)").matches ||
      window.matchMedia("(pointer: coarse)").matches;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    const weak = (navigator.hardwareConcurrency ?? 8) <= 4 || nav.connection?.saveData === true;
    const N = Math.floor((mobile ? 600 : 1600) * (weak ? 0.6 : 1));
    let live = N;

    const idR = seedIdentity(N);
    const phaseA = new Float32Array(N);
    const phaseB = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      phaseA[i] = idR[i] * Math.PI * 2;
      phaseB[i] = ((idR[i] * 7919) % 1) * Math.PI * 2;
    }
    const px = new Float32Array(N);
    const py = new Float32Array(N);

    const palette = buildPalette(ctx);
    const lut = buildLut(palette);
    const K = PALETTE.length;
    const mintRgb = palette.rgb[PALETTE.MINT];
    const lineStyle = `rgba(${mintRgb[0]},${mintRgb[1]},${mintRgb[2]},0.28)`;

    let formations: Formation[] = [];
    let W = 0;
    let H = 0;
    let dot = 2;
    let inited = false;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dot = Math.max(1.8, Math.min(W, H) * 0.0028) * (mobile ? 1.3 : 1);
      // Formation geometry follows the LAYOUT breakpoint (sections go
      // two-column at Tailwind `lg`), not the particle-count one.
      const narrow = W < 1024;
      formations = [];
      for (let f = 0; f < FOLD_COUNT; f++) formations.push(buildFormation(f, N, W, H, idR, narrow));
      if (!inited) {
        px.set(formations[0].x);
        py.set(formations[0].y);
        inited = true;
      }
    };

    // ── scroll → bracket ─────────────────────────────────────────────────────
    let foldA = 0;
    let foldB = 0;
    let blend = 0;
    let scrollDirty = true;

    const computeScroll = () => {
      const els = document.querySelectorAll<HTMLElement>("[data-fold]");
      const anchors: FoldAnchor[] = [];
      els.forEach((el) => {
        const rect = el.getBoundingClientRect();
        anchors.push({
          i: parseInt(el.dataset.fold || "0", 10) || 0,
          c: rect.top + window.scrollY + rect.height / 2,
        });
      });
      const r = bracket(anchors, window.scrollY + H * 0.5, FOLD_COUNT);
      foldA = r.a;
      foldB = r.b;
      blend = r.blend;
    };

    // ── one physics + draw step ──────────────────────────────────────────────
    const step = (now: number, dt: number, snap: boolean) => {
      const A = formations[foldA] ?? formations[0];
      const B = formations[foldB] ?? A;
      const bl = smoothstep(clamp(blend, 0, 1));
      const stepIdx = Math.round(bl * (BLEND_STEPS - 1));
      const jit = lerp(A.jitter, B.jitter, bl);
      const animate = !snap && !reduced;
      const ease = animate ? 1 - Math.pow(1 - 0.085, dt / 16.667) : 1;
      const time = now * 0.001;
      const breath = dot * 0.9;

      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = lerp(A.alpha, B.alpha, bl);
      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < live; i++) {
        let tx = lerp(A.x[i], B.x[i], bl);
        let ty = lerp(A.y[i], B.y[i], bl);
        if (animate) {
          const n1 = Math.sin(time * 1.1 + phaseA[i]);
          const n2 = Math.sin(time * 0.63 + phaseB[i]);
          const n3 = Math.cos(time * 0.37 + phaseA[i] * 0.5);
          tx += (n1 * 0.6 + n3 * 0.4) * jit + Math.cos(time * 0.45 + phaseB[i]) * breath * 0.5;
          ty += (n2 * 0.7 + n3 * 0.3) * jit + Math.sin(time * 0.6 + phaseA[i]) * breath;
        }
        px[i] += (tx - px[i]) * ease;
        py[i] += (ty - py[i]) * ease;
        ctx.fillStyle = lut[(A.c[i] * K + B.c[i]) * BLEND_STEPS + stepIdx];
        ctx.fillRect(px[i], py[i], dot, dot);
      }

      // Closing net: faint segments between the anchor particles once the
      // final formation has (almost) fully arrived.
      const net = B.segments && (foldA === foldB ? 1 : clamp((bl - 0.9) / 0.1, 0, 1));
      if (net && B.segments) {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = net * B.alpha;
        ctx.strokeStyle = lineStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const s = B.segments;
        for (let k = 0; k < s.length; k += 2) {
          const a = s[k];
          const b = s[k + 1];
          if (a >= live || b >= live) continue;
          ctx.moveTo(px[a] + dot / 2, py[a] + dot / 2);
          ctx.lineTo(px[b] + dot / 2, py[b] + dot / 2);
        }
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    // ── loop, governor, idle throttle ────────────────────────────────────────
    let raf = 0;
    let running = false;
    let killed = false;
    let lastT = performance.now();
    let lastActivity = performance.now();
    let parity = 0;
    let settleFrames = 0;
    const gov = createGovernor({
      budgetMs: DRAW_BUDGET_MS,
      windowSize: GOVERNOR_WINDOW,
      warmupFrames: GOVERNOR_WARMUP,
      maxDowngrades: MAX_DOWNGRADES,
    });

    const debug: DebugHandle | null =
      process.env.NODE_ENV !== "production"
        ? { live, n: N, fold: { a: 0, b: 0, blend: 0 }, downgrades: 0, killed, running, meanDt: 0 }
        : null;
    const syncDebug = () => {
      if (!debug) return;
      debug.live = live;
      debug.fold = { a: foldA, b: foldB, blend };
      debug.downgrades = gov.downgrades;
      debug.killed = killed;
      debug.running = running;
      debug.meanDt = gov.meanMs;
    };

    const stopLoop = () => {
      running = false;
      cancelAnimationFrame(raf);
      syncDebug();
    };

    const kill = () => {
      killed = true;
      stopLoop();
      markKilled();
      // The last frame stays on screen; nothing else runs for this session.
    };

    const govern = (drawMs: number) => {
      const decision = gov.sample(drawMs);
      if (decision === "downgrade") live = gov.liveFor(N);
      else if (decision === "kill") kill();
    };

    const frame = (now: number) => {
      if (!running) return;
      let dt = now - lastT;
      lastT = now;
      dt = clamp(dt, 0, 50);

      if (scrollDirty) {
        computeScroll();
        scrollDirty = false;
        settleFrames = 0;
      }

      if (reduced) {
        // Static per fold: a few settling frames after a scroll, then stop.
        settleFrames++;
        step(now, dt, true);
        syncDebug();
        if (settleFrames > 4) {
          stopLoop();
          return;
        }
        raf = requestAnimationFrame(frame);
        return;
      }

      const idle = now - lastActivity;
      if (idle > IDLE_PAUSE_MS) {
        stopLoop();
        return;
      }
      if (idle > IDLE_HALF_RATE_MS && (parity++ & 1)) {
        raf = requestAnimationFrame(frame);
        return;
      }

      const t0 = performance.now();
      step(now, dt, false);
      govern(performance.now() - t0);
      syncDebug();
      if (running) raf = requestAnimationFrame(frame);
    };

    const startLoop = () => {
      if (running || killed) return;
      running = true;
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
      syncDebug();
    };

    const wake = () => {
      lastActivity = performance.now();
      if (!running) startLoop();
    };
    const onScroll = () => {
      scrollDirty = true;
      wake();
    };
    const onPointer = () => wake();
    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else {
        scrollDirty = true;
        wake();
      }
    };
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        build();
        computeScroll();
        step(performance.now(), 16.667, true);
        scrollDirty = true;
        wake();
      }, 150);
    };

    // ── boot: correct static frame first, then fade in and animate ───────────
    build();
    computeScroll();
    step(performance.now(), 16.667, true);
    canvas.style.opacity = "1";
    startLoop();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("touchstart", onPointer, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    if (debug) (window as Window & { __constellation?: DebugHandle }).__constellation = debug;

    return () => {
      stopLoop();
      window.clearTimeout(resizeTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("touchstart", onPointer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      if (debug) delete (window as Window & { __constellation?: DebugHandle }).__constellation;
    };
  }, [reduced]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      style={{ opacity: 0, transition: reduced ? "none" : "opacity 600ms ease" }}
    />
  );
}
