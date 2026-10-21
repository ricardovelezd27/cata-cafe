// "Catar ahora" — the express way to start a SOLO cupping from a phone in
// three taps (name → format → how many samples). Pure module: the validator
// and the label helpers live here (not in app/actions/sessions.ts, which is
// "use server" and cannot be imported by vitest) so the rules are unit-tested
// and shared by the server action, the form and the notes stage.
//
// Product rules (Ricardo, 2026-10-21):
//   · solo only — no group/async variant;
//   · samples are created WITHOUT a coffee (coffeeId null). The full wizard's
//     validation (`validateSessionInput`) is untouched and still requires one;
//   · the free-text impression typed on the "Notas rápidas" end step is stored
//     under EXPRESS_NOTE_KEY inside the format's module JSON — a key, never a
//     column, never counted by completeness.

import * as v from "@/lib/validate";

export const EXPRESS_MAX_SAMPLES = 20;
export const EXPRESS_DEFAULT_SAMPLES = 6;
export const EXPRESS_NAME_MAX = 120;

/** Key of the per-sample free-text note inside descriptiveData /
 *  affectiveData / combinedData (whichever `moduleKeyForFormat` picks). */
export const EXPRESS_NOTE_KEY = "nota_express";
export const EXPRESS_NOTE_MAX = 500;

export const EXPRESS_FORMATS = ["descriptive", "affective", "combined"] as const;
export type ExpressFormat = (typeof EXPRESS_FORMATS)[number];
export const EXPRESS_DEFAULT_FORMAT: ExpressFormat = "affective";

export type ExpressInput = {
  name: string;
  format: ExpressFormat;
  sampleCount: number;
};

/** Validates what the express form posts. Throws `invalid_input` (a
 *  ValidationError from lib/validate) so `run()` maps it to the action code. */
export function validateExpressInput(input: {
  name?: unknown;
  format?: unknown;
  sampleCount?: unknown;
}): ExpressInput {
  const name = v.str(input.name, "name", { max: EXPRESS_NAME_MAX })!;
  const format = v.oneOf(input.format, "format", EXPRESS_FORMATS);
  const sampleCount = v.int(input.sampleCount, "sampleCount", 1, EXPRESS_MAX_SAMPLES);
  return { name, format, sampleCount };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** "Muestra A" … "Muestra T" (0-based index; letters so a phone screen
 *  reads them at a glance — numbers would collide with the position chips).
 *  Falls back to the number past Z, which the 20-sample cap never reaches. */
export function expressSampleLabel(index: number, locale: string = "es"): string {
  const word = locale === "en" ? "Sample" : "Muestra";
  const suffix = index >= 0 && index < LETTERS.length ? LETTERS[index] : String(index + 1);
  return `${word} ${suffix}`;
}

/** Prefilled session name — "Cata · 21 oct 2026" / "Cupping · Oct 21, 2026".
 *  Client-side prefill only; the server never generates names. */
export function defaultExpressName(date: Date, locale: string = "es"): string {
  const fmt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  // es-ES renders "21 oct 2026"; strip the trailing period some engines add
  // to the abbreviated month ("oct.").
  const day = fmt.format(date).replace(/\./g, "");
  return `${locale === "en" ? "Cupping" : "Cata"} · ${day}`;
}

/** Clamp helper for the stepper (−/+): keeps the count inside [1, max]. */
export function clampSampleCount(n: number): number {
  if (!Number.isFinite(n)) return EXPRESS_DEFAULT_SAMPLES;
  return Math.min(EXPRESS_MAX_SAMPLES, Math.max(1, Math.round(n)));
}
