"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CloudWord } from "@/lib/wordCloud";

const DEFAULT_MAX_WORDS = 45;

/** Horizontal stretch of the placement spiral. Tuned to ~1.7:1 overall cloud
 *  aspect: rounded enough to read as a cloud, wide enough to sit in a results
 *  card without growing into a tall column. */
const ELLIPSE_X = 1.5;
const SPIRAL_STEP = 0.16;
const SPIRAL_GROWTH = 2.4;
const MAX_SPIRAL_ITERATIONS = 5000;
const GAP_X = 12;
const GAP_Y = 4;

type Rect = { x0: number; y0: number; x1: number; y1: number };

type PlacedWord = {
  word: CloudWord;
  cx: number;
  cy: number;
  fontSize: number;
  fontWeight: number;
};

type Layout = {
  placed: PlacedWord[];
  width: number;
  height: number;
  scale: number;
};

function overlaps(a: Rect, b: Rect): boolean {
  return !(a.x1 <= b.x0 || a.x0 >= b.x1 || a.y1 <= b.y0 || a.y0 >= b.y1);
}

/**
 * Packs words along an Archimedean spiral: the first (most frequent) word lands
 * dead centre, and each following word walks outward until it finds a gap that
 * clears every word already placed. That is what gives the classic cloud shape
 * — dominant descriptors in the middle, rarer ones fanning out around them.
 */
function buildLayout(
  words: CloudWord[],
  containerWidth: number,
  fontFamily: string,
): Layout | null {
  if (words.length === 0 || containerWidth <= 0) return null;

  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;

  const counts = words.map((w) => w.count);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const allEqual = maxCount === minCount;

  // Type scale tracks the container so the cloud reads the same on a phone and
  // on a wide desktop card.
  const maxFont = Math.max(28, Math.min(66, containerWidth / 9));
  const minFont = Math.max(11, Math.min(17, maxFont / 4));

  const fontFor = (count: number): number => {
    if (allEqual) return (minFont + maxFont) / 2;
    const t = Math.sqrt((count - minCount) / (maxCount - minCount));
    return minFont + t * (maxFont - minFont);
  };

  const placed: PlacedWord[] = [];
  const rects: Rect[] = [];

  for (const word of words) {
    const fontSize = fontFor(word.count);
    const fontWeight = fontSize >= maxFont * 0.75 ? 700 : fontSize >= maxFont * 0.45 ? 600 : 500;

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    // Matches the rendered box exactly: nowrap text at line-height 1, centred
    // on (cx, cy) — so a non-colliding placement here can never visually clash.
    const halfW = ctx.measureText(word.label).width / 2 + GAP_X / 2;
    const halfH = fontSize / 2 + GAP_Y / 2;

    for (let i = 0; i < MAX_SPIRAL_ITERATIONS; i++) {
      const theta = i * SPIRAL_STEP;
      const radius = SPIRAL_GROWTH * theta;
      const cx = Math.cos(theta) * radius * ELLIPSE_X;
      const cy = Math.sin(theta) * radius;
      const rect: Rect = { x0: cx - halfW, y0: cy - halfH, x1: cx + halfW, y1: cy + halfH };
      if (!rects.some((r) => overlaps(r, rect))) {
        rects.push(rect);
        placed.push({ word, cx, cy, fontSize, fontWeight });
        break;
      }
    }
  }

  if (placed.length === 0) return null;

  const x0 = Math.min(...rects.map((r) => r.x0));
  const y0 = Math.min(...rects.map((r) => r.y0));
  const naturalW = Math.max(...rects.map((r) => r.x1)) - x0;
  const naturalH = Math.max(...rects.map((r) => r.y1)) - y0;

  return {
    placed: placed.map((p) => ({ ...p, cx: p.cx - x0, cy: p.cy - y0 })),
    width: naturalW,
    height: naturalH,
    scale: Math.min(1, containerWidth / naturalW),
  };
}

/**
 * Frequency-scaled flavour cloud. Words are plain coloured text (no pills),
 * sized on a sqrt scale so a couple of dominant descriptors don't linearly
 * flatten everything else, and spiral-packed into a cloud around the leader.
 */
export function WordCloud({
  words,
  maxWords = DEFAULT_MAX_WORDS,
  emptyLabel,
}: {
  words: CloudWord[];
  maxWords?: number;
  emptyLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastWidthRef = useRef(-1);
  const [layout, setLayout] = useState<Layout | null>(null);

  const shown = useMemo(() => words.slice(0, maxWords), [words, maxWords]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let alive = true;

    const compute = (force: boolean) => {
      if (!alive) return;
      const width = el.getBoundingClientRect().width;
      // Only width drives the layout; ignoring height changes keeps the
      // observer from re-firing on the height this very layout just set.
      if (!force && Math.abs(width - lastWidthRef.current) < 1) return;
      lastWidthRef.current = width;
      setLayout(buildLayout(shown, width, getComputedStyle(el).fontFamily));
    };

    compute(true);
    const observer = new ResizeObserver(() => compute(false));
    observer.observe(el);
    // Text measured before the webfont lands is the wrong width — repack once
    // the real font is in.
    document.fonts?.ready.then(() => compute(true));

    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [shown]);

  if (shown.length === 0) {
    return <p className="py-2 text-sm italic text-brown-mid">{emptyLabel}</p>;
  }

  return (
    <div ref={containerRef} className="w-full py-2">
      <div
        style={{
          position: "relative",
          width: "100%",
          height: layout ? layout.height * layout.scale : 160,
        }}
      >
        {layout && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              width: layout.width,
              height: layout.height,
              transform: `translateX(-50%) scale(${layout.scale})`,
              transformOrigin: "top center",
            }}
          >
            {layout.placed.map((p) => (
              <span
                key={p.word.id}
                title={`${p.word.label} (${p.word.count})`}
                style={{
                  position: "absolute",
                  left: p.cx,
                  top: p.cy,
                  transform: "translate(-50%, -50%)",
                  fontSize: p.fontSize,
                  fontWeight: p.fontWeight,
                  color: p.word.color,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  cursor: "default",
                }}
              >
                {p.word.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
