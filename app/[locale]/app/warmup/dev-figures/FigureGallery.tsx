"use client";

import { useState } from "react";
import {
  WARMUP_EN_STATUS,
  WARMUP_EXERCISES,
  WARMUP_SHARED,
  lw,
  type WarmupExercise,
  type WarmupLead,
} from "@/lib/warmup/exercises";
import { neutralPose } from "@/lib/warmup/preview";
import { WarmupFigure } from "@/components/warmup/figures";

const LEADS: Array<WarmupLead | ""> = ["", "head", "nose", "ear", "shoulders", "pelvis", "hip", "all"];
/** Kinds whose `a` runs 0..1 (one-sided); the others are symmetric -1..1. */
const ONE_SIDED = new Set(["arm-raise", "trunk-forward-back"]);

const btn =
  "rounded-pill border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container";

/**
 * Dev review board for the static figure layer: one card per kind with a pose
 * slider (a, and b for the eyes), eyes toggle, lead select and the
 * trajectory from neutral to +1. Figures no longer animate on their own —
 * the player drives them — so there is no speed / replay / pause here.
 */
export function FigureGallery({ locale }: { locale: string }) {
  const [tile, setTile] = useState(false);
  const [highlight, setHighlight] = useState(true);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
            dev · figures review
          </p>
          <h1 className="font-display text-3xl text-primary-container">
            {lw(WARMUP_SHARED.title, locale)} — figuras
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            EN: {WARMUP_EN_STATUS}. Mirror semantics: “derecha” = viewer&apos;s right.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} aria-pressed={tile} onClick={() => setTile((v) => !v)}>
            Frame: {tile ? "tile" : "stage"}
          </button>
          <button type="button" className={btn} aria-pressed={highlight} onClick={() => setHighlight((v) => !v)}>
            Highlight: {highlight ? "on" : "off"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {WARMUP_EXERCISES.map((ex) => (
          <GalleryCard key={ex.id} ex={ex} locale={locale} tile={tile} highlight={highlight} />
        ))}
      </div>
    </div>
  );
}

function GalleryCard({
  ex,
  locale,
  tile,
  highlight,
}: {
  ex: WarmupExercise;
  locale: string;
  tile: boolean;
  highlight: boolean;
}) {
  const kind = ex.figureKind;
  const isEyes = kind === "eyes";
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [closed, setClosed] = useState(isEyes);
  const [lead, setLead] = useState<WarmupLead | "">("");

  const minA = ONE_SIDED.has(kind) ? 0 : -1;
  const pose = isEyes ? { a, b } : { a };
  const peak = isEyes ? { a: 1, b: 0 } : { a: 1 };
  const progress = Math.max(0, Math.min(1, a));

  return (
    <figure className="rounded-card border border-outline-variant bg-surface-container-lowest p-4">
      <div className={tile ? "mx-auto h-[88px] w-[88px] overflow-hidden rounded-card" : "aspect-[3/4] max-h-[320px] w-full"}>
        <WarmupFigure
          kind={kind}
          eyes={closed ? "closed" : "open"}
          lead={lead || undefined}
          highlight={highlight}
          pose={pose}
          path={{ from: neutralPose(kind), to: peak, progress }}
          frame={tile ? "tile" : "stage"}
          title={lw(ex.name, locale)}
        />
      </div>
      <figcaption className="mt-3 space-y-2 text-xs text-on-surface-variant">
        <span className="block font-semibold text-on-surface">
          {ex.order}. {lw(ex.name, locale)} · {kind}
        </span>
        <label className="flex items-center gap-2">
          <span className="w-4">a</span>
          <input
            type="range"
            min={minA}
            max={1}
            step={0.01}
            value={a}
            onChange={(e) => setA(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-10 text-right tabular-nums">{a.toFixed(2)}</span>
        </label>
        {isEyes && (
          <label className="flex items-center gap-2">
            <span className="w-4">b</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={b}
              onChange={(e) => setB(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-10 text-right tabular-nums">{b.toFixed(2)}</span>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} aria-pressed={closed} onClick={() => setClosed((v) => !v)}>
            Eyes: {closed ? "closed" : "open"}
          </button>
          <select
            className={btn}
            value={lead}
            onChange={(e) => setLead(e.target.value as WarmupLead | "")}
            aria-label="lead"
          >
            {LEADS.map((l) => (
              <option key={l || "none"} value={l}>
                lead: {l || "none"}
              </option>
            ))}
          </select>
        </div>
      </figcaption>
    </figure>
  );
}
