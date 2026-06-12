// Static fair-value lookup derived from PUBLIC percentile data in the
// Specialty Coffee Transaction Guide (FOB, USD/lb converted to EUR/kg).
// Deliberately coarse: the widget always shows a RANGE, never a point price.
// The band will be refined with aggregated community data later (roadmap).

export const SCORE_MIN = 80;
export const SCORE_MAX = 92;
export const SCORE_STEP = 0.25;
export const SCORE_DEFAULT = 86;

export const ORIGIN_KEYS = [
  "etiopia",
  "kenia",
  "colombia",
  "centroamerica",
  "brasil",
  "otros",
] as const;
export type OriginKey = (typeof ORIGIN_KEYS)[number];

export const PROCESS_KEYS = [
  "lavado",
  "natural",
  "honey",
  "fermentacion",
] as const;
export type ProcessKey = (typeof PROCESS_KEYS)[number];

// p25–p75 percentile bands in €/kg per CVA score bucket.
const SCORE_BANDS: { min: number; max: number; low: number; high: number }[] = [
  { min: 80, max: 82.99, low: 4.4, high: 6.2 },
  { min: 83, max: 84.99, low: 5.5, high: 7.9 },
  { min: 85, max: 86.99, low: 7.0, high: 10.6 },
  { min: 87, max: 88.99, low: 9.2, high: 14.5 },
  { min: 89, max: 92, low: 12.5, high: 22.0 },
];

const ORIGIN_MODIFIERS: Record<OriginKey, number> = {
  etiopia: 1.1,
  kenia: 1.12,
  colombia: 1.0,
  centroamerica: 0.97,
  brasil: 0.88,
  otros: 1.0,
};

const PROCESS_MODIFIERS: Record<ProcessKey, number> = {
  lavado: 1.0,
  natural: 1.05,
  honey: 1.04,
  fermentacion: 1.15,
};

const roundTo10Cents = (n: number) => Math.round(n * 10) / 10;

export function calcPriceBand(
  score: number,
  origin: OriginKey,
  process: ProcessKey,
): { low: number; high: number } {
  const bucket =
    SCORE_BANDS.find((b) => score >= b.min && score <= b.max) ??
    SCORE_BANDS[SCORE_BANDS.length - 1];
  const mod = ORIGIN_MODIFIERS[origin] * PROCESS_MODIFIERS[process];
  return {
    low: roundTo10Cents(bucket.low * mod),
    high: roundTo10Cents(bucket.high * mod),
  };
}
