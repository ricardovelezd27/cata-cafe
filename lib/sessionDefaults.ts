// One place for what the express form and the full wizard both start from
// (S8-10 T9, F-04-8 / F-express-6). Pure: vitest pins it.
//
//  · each flow keeps its own first-run default format, but BOTH prefer the
//    format the person used last (`cata_last_format`, a per-device convenience);
//  · "Configurar sesión completa" hands name / format / sample count to the
//    wizard in the query string; `parseWizardHandoff` ignores bad values.

import {
  EXPRESS_FORMATS,
  EXPRESS_MAX_SAMPLES,
  EXPRESS_NAME_MAX,
  type ExpressFormat,
} from "@/lib/expressSession";

export type SessionFormat = ExpressFormat;
export const SESSION_FORMATS = EXPRESS_FORMATS;

export const WIZARD_DEFAULT_FORMAT: SessionFormat = "combined";
export const EXPRESS_FIRST_RUN_FORMAT: SessionFormat = "affective";

export const LAST_FORMAT_KEY = "cata_last_format";

export function isSessionFormat(value: unknown): value is SessionFormat {
  return typeof value === "string" && (SESSION_FORMATS as readonly string[]).includes(value);
}

/** Stored value -> format, or null when absent / tampered. */
export function parseLastFormat(raw: unknown): SessionFormat | null {
  return isSessionFormat(raw) ? raw : null;
}

export type WizardHandoff = { name?: string; format?: SessionFormat; sampleCount?: number };

function first(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

/** Query params -> prefill. Anything invalid is dropped, never an error. */
export function parseWizardHandoff(params: {
  name?: unknown;
  format?: unknown;
  n?: unknown;
}): WizardHandoff {
  const out: WizardHandoff = {};
  const name = first(params.name);
  if (typeof name === "string") {
    const trimmed = name.trim();
    if (trimmed && trimmed.length <= EXPRESS_NAME_MAX) out.name = trimmed;
  }
  const format = first(params.format);
  if (isSessionFormat(format)) out.format = format;
  const n = first(params.n);
  if (typeof n === "string" && /^\d{1,2}$/.test(n)) {
    const count = Number(n);
    if (count >= 1 && count <= EXPRESS_MAX_SAMPLES) out.sampleCount = count;
  }
  return out;
}

/** Inverse of parseWizardHandoff: "?name=…&format=…&n=…" (always starts with ?). */
export function wizardHandoffQuery(input: {
  name: string;
  format: SessionFormat;
  sampleCount: number;
}): string {
  const q = new URLSearchParams();
  const name = input.name.trim();
  if (name) q.set("name", name.slice(0, EXPRESS_NAME_MAX));
  q.set("format", input.format);
  q.set("n", String(input.sampleCount));
  return `?${q.toString()}`;
}
