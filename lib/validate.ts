// Tiny input validation for server actions (no zod — the ~15 fields that
// matter don't justify a dependency). Every helper either returns the
// normalized value or throws Error("invalid_input"), which run() in
// lib/safeAction.ts maps to the `invalid_input` result code. Actions that
// already have their own richer error codes (the session wizard) call the
// helpers inside a try/catch and translate.
//
// Rule: anything a client can post — strings, numbers, enums, dates, array
// lengths — goes through one of these before it reaches Prisma. Numbers that
// feed scoring (cupsPerSample) are NEVER taken from the client at evaluation
// time; they are read from the session row (see upsertEvaluation).

export class ValidationError extends Error {
  constructor(public readonly field: string) {
    super("invalid_input");
    this.name = "ValidationError";
  }
}

const fail = (field: string): never => {
  throw new ValidationError(field);
};

/** Trimmed string within [min, max]. `required: false` turns "" / null /
 *  undefined into null instead of failing. */
export function str(
  value: unknown,
  field: string,
  opts: { max: number; min?: number; required?: boolean },
): string | null {
  const required = opts.required ?? true;
  if (value === null || value === undefined) return required ? fail(field) : null;
  if (typeof value !== "string") return fail(field);
  const trimmed = value.trim();
  if (trimmed.length === 0) return required ? fail(field) : null;
  if (trimmed.length < (opts.min ?? 1) || trimmed.length > opts.max) return fail(field);
  return trimmed;
}

/** Integer within [min, max]. */
export function int(value: unknown, field: string, min: number, max: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) return fail(field);
  return n;
}

/** One of an allow-list of string literals. */
export function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    return fail(field);
  }
  return value as T;
}

/** A parseable date (ISO string or epoch ms). `future: true` also requires it
 *  to be at least one minute ahead of now. */
export function isoDate(value: unknown, field: string, opts: { future?: boolean } = {}): Date {
  if (typeof value !== "string" && typeof value !== "number") return fail(field);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fail(field);
  if (opts.future && d.getTime() < Date.now() + 60_000) return fail(field);
  return d;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date from an `<input type="date">` (`YYYY-MM-DD`), interpreted
 *  as the END of that day (23:59:59.999 UTC) — the way a "closing date" reads
 *  to the person picking it. `new Date("YYYY-MM-DD")` alone would mean 00:00
 *  UTC, i.e. the session would expire in the early hours of the chosen day.
 *  `future: true` requires that end-of-day instant to be ahead of now, so
 *  picking today is allowed. */
export function dateOnlyEndOfDay(
  value: unknown,
  field: string,
  opts: { future?: boolean } = {},
): Date {
  if (typeof value !== "string" || !DATE_ONLY_RE.test(value)) return fail(field);
  const d = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime())) return fail(field);
  if (opts.future && d.getTime() < Date.now() + 60_000) return fail(field);
  return d;
}

/** Array length guard (the elements are validated by the caller). */
export function list<T>(value: unknown, field: string, max: number, min = 0): T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) return fail(field);
  return value as T[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function email(value: unknown, field = "email"): string {
  const s = str(value, field, { max: 254 });
  if (!s || !EMAIL_RE.test(s)) return fail(field);
  return s.toLowerCase();
}

/** Coerces a client-supplied cup array to at most `cups` booleans. Anything
 *  that is not literally `true` counts as false; extra entries are dropped. */
export function cupFlags(value: unknown, cups: number): boolean[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, Math.max(0, cups)).map((v) => v === true);
}
