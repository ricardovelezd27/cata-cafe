import { describe, expect, it } from "vitest";
import {
  FOLD_COUNT,
  NET_ANCHORS,
  PALETTE,
  buildFormation,
  seedIdentity,
  type Formation,
} from "@/components/landing/journey/formations";

const N = 1600;
const DESKTOP = { W: 1440, H: 900, narrow: false };
const MOBILE = { W: 390, H: 844, narrow: true };
const idR = seedIdentity(N);

function build(fold: number, vp = DESKTOP): Formation {
  return buildFormation(fold, N, vp.W, vp.H, idR, vp.narrow);
}

function fractionWhere(f: Formation, pred: (x: number, y: number) => boolean) {
  let n = 0;
  for (let i = 0; i < N; i++) if (pred(f.x[i], f.y[i])) n++;
  return n / N;
}

function bbox(f: Formation) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, f.x[i]); maxX = Math.max(maxX, f.x[i]);
    minY = Math.min(minY, f.y[i]); maxY = Math.max(maxY, f.y[i]);
  }
  return { minX, maxX, minY, maxY };
}

describe("seedIdentity", () => {
  it("is deterministic and uniform in [0,1)", () => {
    const a = seedIdentity(64);
    const b = seedIdentity(64);
    expect(Array.from(a)).toEqual(Array.from(b));
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("every formation", () => {
  it("has six folds", () => {
    expect(FOLD_COUNT).toBe(6);
  });

  for (const vp of [DESKTOP, MOBILE]) {
    for (let fold = 0; fold < 6; fold++) {
      it(`fold ${fold} @${vp.W}x${vp.H} has N in-bounds targets, valid colours and alpha`, () => {
        const f = build(fold, vp);
        expect(f.x.length).toBe(N);
        expect(f.y.length).toBe(N);
        expect(f.c.length).toBe(N);
        // ≤ 2 % intentional spill outside the viewport, never more.
        const out = fractionWhere(
          f,
          (x, y) => x < -8 || x > vp.W + 8 || y < -8 || y > vp.H + 8,
        );
        expect(out).toBeLessThanOrEqual(0.02);
        for (let i = 0; i < N; i++) {
          expect(f.c[i]).toBeGreaterThanOrEqual(0);
          expect(f.c[i]).toBeLessThan(PALETTE.length);
        }
        expect(f.alpha).toBeGreaterThan(0);
        expect(f.alpha).toBeLessThanOrEqual(1);
        expect(f.jitter).toBeGreaterThanOrEqual(0);
      });
    }
  }

  it("jitter descends from dispersion to convergence", () => {
    const j = [0, 1, 2, 3, 4].map((k) => build(k).jitter);
    expect(j[0]).toBeGreaterThan(j[1]);
    expect(j[1]).toBeGreaterThan(j[2]);
    expect(j[2]).toBeGreaterThan(j[3]);
    expect(j[3]).toBeGreaterThan(j[4]);
  });
});

describe("text lanes (desktop)", () => {
  it("hero cloud is right-weighted — ≤ 35 % in the copy column (left half)", () => {
    const f = build(0);
    expect(fractionWhere(f, (x) => x < DESKTOP.W * 0.5)).toBeLessThanOrEqual(0.35);
  });

  it("folds 1 and 3 keep ≤ 25 % of particles in the left 55 % (copy column)", () => {
    for (const fold of [1, 3]) {
      const f = build(fold);
      expect(fractionWhere(f, (x) => x < DESKTOP.W * 0.55)).toBeLessThanOrEqual(0.25);
    }
  });

  it("fold 2 mirrors the layout — ≤ 25 % in the right 55 % (copy column)", () => {
    const f = build(2);
    expect(fractionWhere(f, (x) => x > DESKTOP.W * 0.45)).toBeLessThanOrEqual(0.25);
  });
});

describe("meaning of each formation", () => {
  it("fold 0 (dispersión) is mostly mint with a terracotta minority", () => {
    const f = build(0);
    let t = 0, m = 0;
    for (let i = 0; i < N; i++) {
      if (f.c[i] === PALETTE.TERRA || f.c[i] === PALETTE.TERRA_DIM) t++;
      if (f.c[i] === PALETTE.MINT || f.c[i] === PALETTE.MINT_DIM) m++;
    }
    expect(t / N).toBeGreaterThan(0.12);
    expect(t / N).toBeLessThan(0.3);
    expect(m / N).toBeGreaterThan(0.6);
  });

  it("fold 2 (describir) uses all nine flavor families", () => {
    const f = build(2);
    const used = new Set<number>();
    for (let i = 0; i < N; i++) used.add(f.c[i]);
    for (let k = 0; k < 9; k++) expect(used.has(PALETTE.FLAVOR0 + k)).toBe(true);
  });

  it("fold 3 (calibrar) is a horizontal line: tiny vertical spread for the cohort, tight around the reference", () => {
    const f = build(3);
    const cohortYs: number[] = [];
    const cohortXs: number[] = [];
    let refCount = 0;
    for (let i = 0; i < N; i++) {
      if (f.c[i] === PALETTE.MINT || f.c[i] === PALETTE.MINT_DIM) refCount++;
      else {
        cohortYs.push(f.y[i]);
        cohortXs.push(f.x[i]);
      }
    }
    expect(refCount / N).toBeGreaterThan(0.08);
    expect(refCount / N).toBeLessThan(0.25);
    const ySpread = Math.max(...cohortYs) - Math.min(...cohortYs);
    expect(ySpread).toBeLessThan(DESKTOP.H * 0.08);
    // ≥ 60 % of the cohort sits within ±6 % of the track around the reference (7.5 on 1–9).
    const x0 = DESKTOP.W * 0.5, x1 = DESKTOP.W * 0.95;
    const ref = x0 + ((7.5 - 1) / 8) * (x1 - x0);
    const near = cohortXs.filter((x) => Math.abs(x - ref) <= (x1 - x0) * 0.06).length;
    expect(near / cohortXs.length).toBeGreaterThanOrEqual(0.6);
  });

  it("fold 4 (converger) forms a centred glyph block that reads as three characters", () => {
    const f = build(4);
    const b = bbox(f);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    expect(Math.abs(cx - DESKTOP.W / 2)).toBeLessThan(DESKTOP.W * 0.03);
    expect(Math.abs(cy - DESKTOP.H / 2)).toBeLessThan(DESKTOP.H * 0.03);
    // Three separated column groups: histogram of x has ≥ 2 empty gaps inside the bbox.
    const bins = new Array(60).fill(0);
    for (let i = 0; i < N; i++) {
      const k = Math.min(59, Math.floor(((f.x[i] - b.minX) / (b.maxX - b.minX + 1e-6)) * 60));
      bins[k]++;
    }
    let gaps = 0, inGap = false;
    for (const v of bins) {
      if (v === 0 && !inGap) { gaps++; inGap = true; }
      if (v > 0) inGap = false;
    }
    expect(gaps).toBeGreaterThanOrEqual(2);
    // Cream-only.
    for (let i = 0; i < N; i++) {
      expect([PALETTE.CREAM, PALETTE.CREAM_DIM]).toContain(f.c[i]);
    }
  });

  it("fold 5 (constelación) pins the first anchors to the net points and keeps neighbour segments short", () => {
    const f = build(5);
    expect(NET_ANCHORS.length).toBeGreaterThanOrEqual(40);
    expect(f.segments).toBeDefined();
    const segs = f.segments!;
    expect(segs.length).toBeGreaterThan(NET_ANCHORS.length);
    const maxLen = Math.min(DESKTOP.W, DESKTOP.H) * 0.22;
    for (let s = 0; s < segs.length; s += 2) {
      const a = segs[s], b = segs[s + 1];
      expect(a).toBeLessThan(NET_ANCHORS.length);
      expect(b).toBeLessThan(NET_ANCHORS.length);
      const d = Math.hypot(f.x[a] - f.x[b], f.y[a] - f.y[b]);
      expect(d).toBeLessThanOrEqual(maxLen);
    }
    expect(f.alpha).toBeLessThan(build(0).alpha);
  });
});
