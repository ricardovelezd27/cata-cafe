"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { createGovernor } from "@/lib/canvas/governor";
import { dotSize, driftX, driftY, frameEase, mulberry32, resolveRgb, type RGB } from "@/lib/canvas/particles";
import {
  FIELD_BUDGET,
  blankField,
  copyField,
  fieldDotCount,
  fieldDrawDecision,
  fillTargets,
  sameField,
  seedField,
  type FieldState,
} from "@/lib/warmup/stageField";
import s from "./StageField.module.css";

/**
 * The dots of the warm-up's stage, for the whole run: they breathe with you
 * on the arrival, travel with the body part during a movement, gather on a
 * hold and settle into a ring at the end. WHAT they do is decided by the pure
 * lib/warmup/stageField.ts; this component only draws it.
 *
 * It speaks the landing's particle dialect (lib/canvas/particles.ts: the same
 * dot, the same frame-rate-independent easing, the same idle drift) and keeps
 * the same draw-cost governor (lib/canvas/governor.ts). It is a second HOST of
 * that language, not a second engine, because of one hard rule of the player:
 *
 *   No clock and no loop of its own. The player calls `draw()` from its single
 *   rAF loop (hooks/useRunClock) with the state it computed for that moment.
 *
 * Budget (lib/warmup/stageField.ts FIELD_BUDGET): never more than 30 draws a
 * second, about 10 while the eyes-closed screen has its controls hidden,
 * nothing at all when the picture would not change; at most 300 dots on a
 * phone; no gradient and no colour string made per frame (the pool of light
 * is a CSS layer moved with transform and opacity); a governor that cuts the
 * dots, then switches the field off for this page, when a draw costs too much.
 *
 * Colours come from the tokens at mount (never hex): on the light stage the
 * dots are drawn source-over in deep green and terracotta so they READ; on
 * the eyes-closed stage they are mint and cream with additive blend, exactly
 * as on the landing.
 */
export interface StageFieldHandle {
  /** Called from the player's loop. `tMs` is the run clock (for the drift).
   *  `unwatched`: eyes closed and the controls hidden. `snap`: no easing (a
   *  paused seek, a first frame). */
  draw(state: FieldState, tMs: number, unwatched?: boolean, snap?: boolean): void;
}

export interface StageFieldProps {
  /** The breath label of the arrival ("Toma aire" / "Suéltalo"); "" = none. */
  phase: "rest" | "in" | "out";
  label: string;
  dusk?: boolean;
  reduced?: boolean;
  ref?: Ref<StageFieldHandle>;
}

const TOKENS = {
  deep: "--color-primary-container",
  terra: "--color-secondary",
  bright: "--color-secondary-container",
  mint: "--color-primary-fixed",
  cream: "--color-surface",
} as const;
// Snapshot of app/globals.css, used ONLY if a token is missing at runtime
// (same sanctioned exception as the landing engine).
const FALLBACK: Record<keyof typeof TOKENS, string> = {
  deep: "#2c4c3b",
  terra: "#9d4326",
  bright: "#fd8c6a",
  mint: "#c7ebd4",
  cream: "#fff8f6",
};

// Roles repeat every 13 dots (8 base, 4 second, 1 accent) so a governor cut,
// which keeps the first dots, keeps the same proportions.
const ROLE_OF = [0, 0, 1, 0, 0, 1, 0, 2, 0, 1, 0, 0, 1] as const;
const LIGHT_ALPHA = [0.62, 0.72, 0.92] as const;
const DUSK_ALPHA = [0.8, 0.4, 0.85] as const;
const GOVERNOR = { budgetMs: FIELD_BUDGET.drawBudgetMs, windowSize: 60, warmupFrames: 30, maxDowngrades: 2 } as const;

/** Once the governor gives up, the field stays off until the page reloads. */
let killedThisPage = false;

interface DebugHandle {
  n: number;
  live: number;
  draws: number;
  skipped: number;
  lastMs: number;
  meanMs: number;
  downgrades: number;
  killed: boolean;
}

interface Engine {
  draw: (state: FieldState, tMs: number, unwatched: boolean, snap: boolean, force: boolean) => void;
}

export function StageField({ phase, label, dusk = false, reduced = false, ref }: StageFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const duskRef = useRef(dusk);
  const reducedRef = useRef(reduced);
  useEffect(() => {
    duskRef.current = dusk;
    reducedRef.current = reduced;
  }, [dusk, reduced]);

  // Previous label fades out under the incoming one (derived state, no effect).
  const [labels, setLabels] = useState({ cur: label, prev: null as string | null, n: 0 });
  if (labels.cur !== label) setLabels({ cur: label, prev: labels.cur, n: labels.n + 1 });

  useImperativeHandle(
    ref,
    () => ({ draw: (state, tMs, unwatched = false, snap = false) => engine.current?.draw(state, tMs, unwatched, snap, false) }),
    [],
  );

  // Built in a LAYOUT effect: the player paints once from its own layout
  // effect (a parent's runs after a child's), and that first paint must land.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    const halo = haloRef.current;
    if (!canvas || !box || !halo || killedThisPage) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // ── capacity: the landing's rule for "phone" and "weak device" ──
    const mobile = window.matchMedia("(max-width: 768px)").matches || window.matchMedia("(pointer: coarse)").matches;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    const weak = (navigator.hardwareConcurrency ?? 8) <= 4 || nav.connection?.saveData === true;
    const N = fieldDotCount({ coarse: mobile, weak });
    let live = N;

    const id = seedField(N, mulberry32(0x5eed));
    const role = new Uint8Array(N);
    const edge = new Float32Array(N); // outer dots fade a little: a soft rim
    for (let i = 0; i < N; i++) {
      role[i] = ROLE_OF[i % ROLE_OF.length];
      edge[i] = 1 - 0.45 * id.rad[i] * id.rad[i];
    }
    const tgtX = new Float32Array(N);
    const tgtY = new Float32Array(N);
    const px = new Float32Array(N);
    const py = new Float32Array(N);

    const style = getComputedStyle(document.documentElement);
    const tok = (k: keyof typeof TOKENS): RGB => resolveRgb(ctx, style.getPropertyValue(TOKENS[k]).trim(), FALLBACK[k]);
    const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;
    // Made once: the hot loop only picks one of these and sets globalAlpha.
    const lightFill = [css(tok("deep")), css(tok("terra")), css(tok("bright"))];
    const duskFill = [css(tok("mint")), css(tok("mint")), css(tok("cream"))];

    let W = 0;
    let H = 0;
    let R = 100;
    let dot = 2;
    let inited = false;
    let settled = false;
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
      dot = dotSize(window.innerWidth, window.innerHeight, mobile);
      halo.style.setProperty("--halo-d", `${Math.round(R * 2.5)}px`);
      inited = false; // the next draw snaps: every position is stale
      settled = false;
    };

    const gov = createGovernor(GOVERNOR);
    const debug: DebugHandle | null =
      process.env.NODE_ENV !== "production" ? { n: N, live, draws: 0, skipped: 0, lastMs: 0, meanMs: 0, downgrades: 0, killed: false } : null;
    if (debug) (window as Window & { __stageField?: DebugHandle }).__stageField = debug;

    const last = blankField();
    let lastT = 0;
    let lastDusk = duskRef.current;
    let lastDrawAt = -Infinity;
    let dead = false;
    // The pool of light and the presence ease like the dots do.
    let hSpread = last.spread;
    let hGlow = 0;
    let hX = 0;
    let hY = 0;
    let presence = 1;
    let hkx = NaN;
    let hky = NaN;
    let hks = NaN;
    let hko = NaN;

    const kill = () => {
      dead = true;
      killedThisPage = true;
      ctx.clearRect(0, 0, W, H);
      halo.style.opacity = "0";
      if (debug) debug.killed = true;
    };

    const draw = (state: FieldState, tMs: number, unwatched: boolean, snap: boolean, force: boolean) => {
      if (dead) return;
      const now = performance.now();
      if (!W) build();
      const isDusk = duskRef.current;
      const still = reducedRef.current;
      const decision = fieldDrawDecision({
        sinceLastMs: now - lastDrawAt,
        unwatched,
        force: force || !inited,
        settled,
        jitter: still ? 0 : state.jitter,
        unchanged: isDusk === lastDusk && sameField(state, last),
      });
      if (decision !== "draw") {
        // Too soon, or nothing would change: do not draw at all.
        if (debug && decision === "same") debug.skipped++;
        return;
      }
      const snapNow = snap || still || !inited;
      const dt = Math.min(120, Math.max(0, now - lastDrawAt));
      lastDrawAt = now;
      copyField(state, last);
      lastT = tMs;
      lastDusk = isDusk;

      const ease = snapNow ? 1 : frameEase(dt);
      const time = tMs * 0.001;
      const cx = W / 2;
      const cy = H / 2;
      const jit = still ? 0 : dot * 2.2 * state.jitter;
      const sway = still ? 0 : dot * 0.9 * state.jitter;
      const fills = isDusk ? duskFill : lightFill;
      const alpha = isDusk ? DUSK_ALPHA : LIGHT_ALPHA;
      presence += (state.presence - presence) * ease;

      fillTargets(state, id, live, tgtX, tgtY);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = isDusk ? "lighter" : "source-over";
      let far = 0;
      let lastRole = -1;
      for (let i = 0; i < live; i++) {
        let tx = cx + tgtX[i] * R;
        let ty = cy + tgtY[i] * R;
        if (jit) {
          tx += driftX(time, id.phaseA[i], id.phaseB[i], jit, sway);
          ty += driftY(time, id.phaseA[i], id.phaseB[i], jit, sway);
        }
        px[i] += (tx - px[i]) * ease;
        py[i] += (ty - py[i]) * ease;
        const off = Math.abs(tx - px[i]) + Math.abs(ty - py[i]);
        if (off > far) far = off;
        const r = role[i];
        if (r !== lastRole) {
          ctx.fillStyle = fills[r];
          lastRole = r;
        }
        ctx.globalAlpha = Math.min(1, alpha[r] * edge[i] * presence);
        const d = r === 2 ? dot * 1.35 : dot;
        ctx.fillRect(px[i] - d / 2, py[i] - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      inited = true;

      // The pool of light: a CSS layer, written only when it really moves.
      hSpread += (state.spread - hSpread) * ease;
      hGlow += (state.glow - hGlow) * ease;
      hX += (state.dx * R - hX) * ease;
      hY += (state.dy * R - hY) * ease;
      const kx = Math.round(hX);
      const ky = Math.round(hY);
      const ks = Math.round(hSpread * 400);
      const ko = Math.round(hGlow * 100);
      if (kx !== hkx || ky !== hky || ks !== hks || ko !== hko) {
        hkx = kx;
        hky = ky;
        hks = ks;
        hko = ko;
        halo.style.transform = `translate(${kx}px, ${ky}px) scale(${ks / 400})`;
        halo.style.opacity = String(ko / 100);
      }

      settled =
        far < 0.05 &&
        Math.abs(state.presence - presence) < 0.004 &&
        Math.abs(state.spread - hSpread) < 0.002 &&
        Math.abs(state.glow - hGlow) < 0.004 &&
        Math.abs(state.dx * R - hX) < 0.4 &&
        Math.abs(state.dy * R - hY) < 0.4;

      const cost = performance.now() - now;
      if (debug) {
        debug.draws++;
        debug.lastMs = cost;
      }
      if (!force) {
        const verdict = gov.sample(cost);
        if (verdict === "downgrade") live = gov.liveFor(N);
        else if (verdict === "kill") kill();
        if (debug) {
          debug.live = live;
          debug.meanMs = gov.meanMs;
          debug.downgrades = gov.downgrades;
        }
      }
    };

    build();
    draw(last, 0, false, true, true);
    engine.current = { draw };
    const ro = new ResizeObserver(() => {
      build();
      draw(last, lastT, false, true, true);
    });
    ro.observe(box);
    return () => {
      ro.disconnect();
      engine.current = null;
      if (debug) delete (window as Window & { __stageField?: DebugHandle }).__stageField;
    };
    // The engine reads dusk/reduced through refs; it is built once per mount.
  }, []);

  const hasLabel = labels.cur !== "";
  return (
    <div ref={boxRef} className={[s.root, dusk ? s.dusk : ""].join(" ")} data-phase={phase}>
      <div ref={haloRef} className={s.halo} aria-hidden />
      <canvas ref={canvasRef} className={s.canvas} aria-hidden />
      {(hasLabel || labels.prev) && (
        <div className={s.labelBox} data-empty={hasLabel ? undefined : "1"}>
          {labels.prev !== null && labels.prev !== labels.cur && (
            <span key={`${labels.n - 1}:${labels.prev}`} className={`${s.label} ${s.out}`} aria-hidden>
              {labels.prev}
            </span>
          )}
          <span key={`${labels.n}:${labels.cur}`} className={`${s.label} ${labels.n > 0 ? s.in : ""}`}>
            {labels.cur}
          </span>
        </div>
      )}
    </div>
  );
}
