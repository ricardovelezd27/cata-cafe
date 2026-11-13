// The optional "market" note of an affective evaluation (S10 WP3a, Kim A10,
// TODO(kim-validar:A10)). Two keys INSIDE the evaluation's module JSON, never a
// column: `mercado` says from whose point of view the cupper rated ("propio" =
// my own preference, the default; "conocido" = a market I know) and
// `mercado_nota` is a short free text kept only with "conocido".
//
// It qualifies the affective ratings, so it exists only for the affective and
// combined formats. Pure and display-only: scoring, completeness, the SQL
// trigger and AggregateScore NEVER read it. Unknown values are dropped.

import { oneOf, str } from "@/lib/validate";

export const MARKET_KEY = "mercado";
export const MARKET_NOTE_KEY = "mercado_nota";
export const MARKET_NOTE_MAX = 120;
export const MARKET_VALUES = ["propio", "conocido"] as const;
export type MarketPov = (typeof MARKET_VALUES)[number];

/** Returns a copy of `data` whose market keys are valid or absent: a
 *  descriptive module carries none; an unknown `mercado` drops both keys;
 *  `mercado_nota` survives only with "conocido", trimmed, 1..MARKET_NOTE_MAX
 *  chars (anything else is dropped, never an error: the form enforces the cap,
 *  so only a tampered client hits it). Every other key is untouched. */
export function sanitizeMarketNote(
  data: Record<string, unknown>,
  moduleKey: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  delete out[MARKET_KEY];
  delete out[MARKET_NOTE_KEY];
  if (moduleKey !== "affective" && moduleKey !== "combined") return out;

  let pov: MarketPov;
  try {
    pov = oneOf(data[MARKET_KEY], MARKET_KEY, MARKET_VALUES);
  } catch {
    return out;
  }
  out[MARKET_KEY] = pov;
  if (pov === "conocido") {
    try {
      const note = str(data[MARKET_NOTE_KEY], MARKET_NOTE_KEY, { max: MARKET_NOTE_MAX, required: false });
      if (note !== null) out[MARKET_NOTE_KEY] = note;
    } catch {
      /* invalid note: dropped */
    }
  }
  return out;
}

/** What a reader sees for one evaluation: null when the cupper rated by their
 *  own preference (the default) or recorded nothing. */
export function readMarketNote(
  data: Record<string, unknown> | null | undefined,
): { pov: "conocido"; note: string | null } | null {
  if (!data || data[MARKET_KEY] !== "conocido") return null;
  const raw = data[MARKET_NOTE_KEY];
  const note = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, MARKET_NOTE_MAX) : null;
  return { pov: "conocido", note };
}
