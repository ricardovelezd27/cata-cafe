/* ============================================================
   Activity points & cupper levels — Profile v2 (Phase 2)

   Points are a simple weighted sum over a cupper's lifetime activity.
   Levels are derived from a fixed point-threshold ladder (1–6).

   NOTE: `POINT_WEIGHTS` must stay in sync with the raw SQL percentile
   query in app/[locale]/app/profile/page.tsx (the CTE there hardcodes
   the same weights so it can run as a single query across all profiles).
   ============================================================ */

export const POINT_WEIGHTS = { evaluation: 1, sessionJoined: 2, sessionHosted: 5 } as const;

export type ActivityCounts = {
  evaluations: number;
  sessionsJoined: number;
  sessionsHosted: number;
};

export function calcActivityPoints(c: ActivityCounts): number {
  return (
    c.evaluations * POINT_WEIGHTS.evaluation +
    c.sessionsJoined * POINT_WEIGHTS.sessionJoined +
    c.sessionsHosted * POINT_WEIGHTS.sessionHosted
  );
}

export type LevelDefinition = {
  level: number;
  label: { es: string; en: string };
  threshold: number; // minimum points required for this level
};

export const LEVELS: readonly LevelDefinition[] = [
  { level: 1, label: { es: "Aprendiz", en: "Apprentice" }, threshold: 0 },
  { level: 2, label: { es: "Catador Junior", en: "Junior Cupper" }, threshold: 10 },
  { level: 3, label: { es: "Catador", en: "Cupper" }, threshold: 30 },
  { level: 4, label: { es: "Catador Senior", en: "Senior Cupper" }, threshold: 75 },
  { level: 5, label: { es: "Maestro de Cata", en: "Cupping Master" }, threshold: 150 },
  { level: 6, label: { es: "Gran Maestro", en: "Grand Master" }, threshold: 300 },
];

export type LevelInfo = {
  level: number; // 1-6
  label: { es: string; en: string };
  points: number;
  nextThreshold: number | null; // null at max level
  progress: number; // 0..1 toward next threshold (1 at max)
};

export function computeLevel(points: number): LevelInfo {
  // Highest level whose threshold has been reached.
  let current = LEVELS[0];
  for (const def of LEVELS) {
    if (points >= def.threshold) current = def;
    else break;
  }

  const idx = LEVELS.findIndex((d) => d.level === current.level);
  const next = LEVELS[idx + 1] ?? null;

  let progress = 1;
  if (next) {
    const span = next.threshold - current.threshold;
    progress = span > 0 ? Math.max(0, Math.min(1, (points - current.threshold) / span)) : 1;
  }

  return {
    level: current.level,
    label: current.label,
    points,
    nextThreshold: next ? next.threshold : null,
    progress,
  };
}
