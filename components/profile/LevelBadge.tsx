"use client";

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
};

export function LevelBadge({
  locale,
  level,
  levelLabel,
  progress,
  progressText,
  topPercentText,
  t,
}: {
  locale: "es" | "en";
  level: number; // 1-6
  levelLabel: string; // already resolved for locale (LevelInfo.label.es/en)
  progress: number; // 0..1
  progressText: string; // finished "pointsToNext" or "maxLevel" string
  topPercentText: string | null; // finished "topPercent" string, or null to omit the line entirely
  t: LevelBadgeTranslations;
}) {
  const progressPct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const levelOfLabel = locale === "es" ? `Nivel ${level} de 6` : `Level ${level} of 6`;

  return (
    <div className="bg-white border border-[#E8E0D0] rounded-xl p-5 flex flex-col gap-3">
      <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
        {t.levelTitle}
      </span>

      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center h-8 w-8 rounded-full bg-green-dark text-white text-sm font-bold shrink-0">
          {level}
        </span>
        <span className="font-serif text-xl text-green-dark font-bold">
          {levelLabel}
        </span>
      </div>

      <span className="text-sm text-brown-dark">{t.pointsLabel}</span>

      <div
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={levelOfLabel}
        className="h-2 w-full rounded-full bg-[#E8E0D0] overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-green-dark transition-[width] duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <span className="text-xs text-brown-mid">{progressText}</span>

      {topPercentText && (
        <span className="text-xs font-semibold text-amber-warm">{topPercentText}</span>
      )}

      <p className="text-xs text-brown-mid border-t border-[#E8E0D0] pt-2 mt-1">
        {t.howPoints}
      </p>
    </div>
  );
}
