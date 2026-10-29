"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import s from "./BreathField.module.css";

/**
 * Breathing field for "Llega" — the landing page's particle language
 * (components/landing/journey) brought into the warm-up: a soft cloud of
 * dots that widens on each inhale and gathers on the exhale. It replaces
 * the gradient bubble, which was invisible on the cream stage.
 *
 * No clock of its own: the player calls `draw()` from its single rAF loop
 * (hooks/useRunClock) with the breath state it already computes
 * (lib/warmup/breath.ts). React only renders the canvas frame and the label.
 *
 * Colours come from the MD3 tokens at mount (never hex): on the light stage
 * the dots are drawn source-over in deep green + terracotta so they READ; on
 * the dusk stage they are mint/cream with additive blend like the landing.
 */
export interface BreathFieldHandle {
  /** scale 0.62..1 (lungs empty..full), halo 0.25..0.55, tMs for the drift. */
  draw(scale: number, halo: number, tMs: number): void;
}

export interface BreathFieldProps {
  phase: "rest" | "in" | "out";
  label: string;
  dusk?: boolean;
  reduced?: boolean;
  ref?: Ref<BreathFieldHandle>;
}

type RGB = [number, number, number];

const TOKENS = {
  deep: "--color-primary-container",
  terra: "--color-secondary",
  bright: "--color-secondary-container",
  mint: "--color-primary-fixed",
  cream: "--color-surface",
  haloLight: "--color-secondary-fixed",
} as const;
// Snapshot of app/globals.css, used ONLY if a token is missing at runtime
// (same sanctioned exception as the landing engine).
const FALLBACK: Record<keyof typeof TOKENS, string> = {
  deep: "#2c4c3b",
  terra: "#9d4326",
  bright: "#fd8c6a",
  mint: "#c7ebd4",
  cream: "#fff8f6",
  haloLight: "#ffdbcf",
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveRgb(ctx: CanvasRenderingContext2D, css: string, fallback: string): RGB {
  ctx.fillStyle = css || fallback;
  const norm = String(ctx.fillStyle);
  if (norm.startsWith("#") && norm.length >= 7) {
    return [parseInt(norm.slice(1, 3), 16), parseInt(norm.slice(3, 5), 16), parseInt(norm.slice(5, 7), 16)];
  }
  const m = norm.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  ctx.fillStyle = fallback;
  return resolveRgb(ctx, fallback, "#ffffff");
}

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

export function BreathField({ phase, label, dusk = false, reduced = false, ref }: BreathFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const engine = useRef<{ draw: (scale: number, halo: number, tMs: number) => void; dusk: boolean } | null>(null);
  const duskRef = useRef(dusk);
  const reducedRef = useRef(reduced);
  useEffect(() => {
    duskRef.current = dusk;
    reducedRef.current = reduced;
  }, [dusk, reduced]);

  // Previous label fades out under the incoming one (derived state, no effect).
  const [labels, setLabels] = useState({ cur: label, prev: null as string | null, n: 0 });
  if (labels.cur !== label) setLabels({ cur: label, prev: labels.cur, n: labels.n + 1 });

  useImperativeHandle(ref, () => ({ draw: (scale, halo, tMs) => engine.current?.draw(scale, halo, tMs) }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
    const N = Math.floor((coarse ? 360 : 620) * (weak ? 0.6 : 1));
    const rng = mulberry32(0x5eed);
    const ang = new Float32Array(N);
    const rad = new Float32Array(N); // 0..1, uniform over the disc
    const role = new Uint8Array(N); // 0 deep/mint · 1 terra/mint-dim · 2 bright/cream
    const ph = new Float32Array(N);
    const px = new Float32Array(N);
    const py = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      ang[i] = rng() * Math.PI * 2;
      rad[i] = Math.sqrt(rng());
      const r = rng();
      role[i] = r < 0.62 ? 0 : r < 0.92 ? 1 : 2;
      ph[i] = rng() * Math.PI * 2;
    }

    const style = getComputedStyle(document.documentElement);
    const tok = (k: keyof typeof TOKENS) => resolveRgb(ctx, style.getPropertyValue(TOKENS[k]).trim(), FALLBACK[k]);
    const light: RGB[] = [tok("deep"), tok("terra"), tok("bright")];
    const dark: RGB[] = [tok("mint"), tok("mint"), tok("cream")];
    const lightA = [0.62, 0.72, 0.92];
    const darkA = [0.8, 0.4, 0.85];
    const haloLight = tok("haloLight");
    const haloDark = tok("mint");

    let W = 0;
    let H = 0;
    let dot = 2;
    let R = 100;
    let inited = false;
    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = Math.max(1, box.clientWidth);
      H = Math.max(1, box.clientHeight);
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(W, H) * 0.46;
      dot = Math.max(1.8, R * 0.02);
    };

    const draw = (scale: number, halo: number, tMs: number) => {
      if (!W) build();
      const isDusk = duskRef.current;
      const pal = isDusk ? dark : light;
      const alpha = isDusk ? darkA : lightA;
      const still = reducedRef.current;
      // Reduced motion: no size change, only brightness follows the breath.
      const spread = still ? 0.82 : 0.3 + 0.7 * scale;
      const bright = still ? 0.55 + 0.45 * ((scale - 0.62) / 0.38) : 1;
      const time = tMs * 0.001;
      const cx = W / 2;
      const cy = H / 2;
      const jit = still ? 0 : dot * 1.6;
      const ease = still ? 1 : 0.14;

      ctx.clearRect(0, 0, W, H);

      // Halo: a soft disc that breathes with the cloud.
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * spread * 1.25);
      const hc = isDusk ? haloDark : haloLight;
      g.addColorStop(0, rgba(hc, (isDusk ? 0.28 : 0.55) * halo));
      g.addColorStop(1, rgba(hc, 0));
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = isDusk ? "lighter" : "source-over";
      for (let i = 0; i < N; i++) {
        const r = R * spread * rad[i];
        let tx = cx + Math.cos(ang[i] + time * 0.03) * r;
        let ty = cy + Math.sin(ang[i] + time * 0.03) * r;
        if (jit) {
          tx += Math.sin(time * 0.9 + ph[i]) * jit;
          ty += Math.cos(time * 0.7 + ph[i] * 0.5) * jit;
        }
        if (!inited) {
          px[i] = tx;
          py[i] = ty;
        } else {
          px[i] += (tx - px[i]) * ease;
          py[i] += (ty - py[i]) * ease;
        }
        // Outer dots fade a little so the edge of the cloud stays soft.
        const edge = 1 - 0.45 * rad[i] * rad[i];
        ctx.fillStyle = rgba(pal[role[i]], alpha[role[i]] * edge * bright);
        const d = role[i] === 2 ? dot * 1.35 : dot;
        ctx.fillRect(px[i] - d / 2, py[i] - d / 2, d, d);
      }
      inited = true;
      ctx.globalCompositeOperation = "source-over";
    };

    build();
    draw(0.62, 0.25, 0);
    engine.current = { draw, dusk };
    const ro = new ResizeObserver(() => {
      build();
      draw(0.62, 0.25, 0);
    });
    ro.observe(box);
    return () => {
      ro.disconnect();
      engine.current = null;
    };
    // The engine reads dusk/reduced through refs; it is built once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={boxRef} className={[s.root, dusk ? s.dusk : ""].join(" ")} data-phase={phase}>
      <canvas ref={canvasRef} className={s.canvas} aria-hidden />
      <div className={s.labelBox}>
        {labels.prev !== null && labels.prev !== labels.cur && (
          <span key={`${labels.n - 1}:${labels.prev}`} className={`${s.label} ${s.out}`} aria-hidden>
            {labels.prev}
          </span>
        )}
        <span key={`${labels.n}:${labels.cur}`} className={`${s.label} ${labels.n > 0 ? s.in : ""}`}>
          {labels.cur}
        </span>
      </div>
    </div>
  );
}
