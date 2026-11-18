"use client";

import { Card } from "@/components/ui/Card";

// Client component per project i18n convention: translations arrive as a
// plain object (no useTranslations() here). All ICU-templated strings
// (pointsLabel/progressText/topPercentText) are pre-interpolated server-side
// in app/[locale]/app/profile/page.tsx — see the "ICU gotcha" note there —
// since the page is a server component and the counts are known at render
// time, this avoids needing a client-side formatTemplate() helper.

export type LevelBadgeTranslations = {
  levelTitle: string;
  pointsLabel: string; // finished, e.g. "128 puntos"
  howPoints: string;
  /** "Nivel 3 de 6", finished (`profile.levelOf`; P4a: no inline dictionary). */
  levelOf: string;
};

export function LevelBadge({
  level,
  levelLabel,
  progress,
  progressText,
  topPercentText,
  t,
}: {
  /** Kept for callers; the words arrive finished in `t`. */
  locale?: "es" | "en";
  level: number; // 1-6
  levelLabel: string; // already resolved for locale (LevelInfo.label.es/en)
  progress: number; // 0..1
  progressText: string; // finished "pointsToNext" or "maxLevel" string
  topPercentText: string | null; // finished "topPercent" string, or null to omit the line entirely
  t: LevelBadgeTranslations;
}) {
  const progressPct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const levelOfLabel = t.levelOf;

  return (
    // P2b (D-07): a Card.
    <Card className="flex flex-col gap-3">
      <span className="label-caps">
        {t.levelTitle}
      </span>

      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center h-8 w-8 rounded-full bg-primary-container text-on-primary text-caption font-bold shrink-0">
          {level}
        </span>
        <span className="font-display text-card text-primary-container font-bold">
          {levelLabel}
        </span>
      </div>

      <span className="text-caption text-on-surface">{t.pointsLabel}</span>

      <div
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={levelOfLabel}
        className="h-2 w-full rounded-full bg-outline-variant overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-primary-container transition-[width] duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <span className="text-caption text-on-surface-variant">{progressText}</span>

      {topPercentText && (
        <span className="text-caption font-semibold text-on-surface">{topPercentText}</span>
      )}

      <p className="text-caption text-on-surface-variant border-t border-outline-variant pt-2 mt-1">
        {t.howPoints}
      </p>
    </Card>
  );
}
