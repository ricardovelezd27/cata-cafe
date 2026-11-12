// Size and shape bounds for coffee data posted by a client (S8-03,
// F-cafes-7 / F-crear-sesion-4). Server actions are public POST endpoints:
// nothing the browser sends is trusted to be a string, short, or from the known
// list. Pure (no Prisma), so it is unit-tested. Used by createCoffee,
// updateCoffee and the session wizard's validateSessionInput.

export const COFFEE_NAME_MAX = 120;
export const COFFEE_FIELD_MAX = 200;
export const COFFEE_NOTES_MAX = 2000;
export const SAMPLE_LABEL_MAX = 120;
export const MAX_WIZARD_COFFEES = 100;

const TEXT_FIELDS = [
  "country",
  "region",
  "farm",
  "producer",
  "species",
  "variety",
  "harvestYear",
  "processType",
  "altitude",
  "roastLevel",
] as const;

type TextField = (typeof TEXT_FIELDS)[number];

export type NormalizedCoffeeFields = {
  name: string;
  notes: string | null;
  certifications: string[];
} & Record<TextField, string | null>;

/** Optional text: absent/blank → null; a non-string or an over-long value → undefined (invalid). */
function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (t.length > max) return undefined;
  return t || null;
}

/** Certifications: an array of strings, de-duplicated. On "create" an unknown
 *  value is rejected; on "update" it is dropped silently (a legacy coffee may
 *  hold an older label and must stay editable). */
function normalizeCertifications(
  value: unknown,
  known: readonly string[],
  mode: "create" | "update",
): string[] | undefined {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > known.length * 2) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return undefined;
    if (!known.includes(item)) {
      if (mode === "create") return undefined;
      continue;
    }
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

export function normalizeCoffeeFields(
  input: unknown,
  mode: "create" | "update",
  knownCertifications: readonly string[],
): { ok: true; value: NormalizedCoffeeFields } | { ok: false; error: "name_required" | "invalid_input" } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "invalid_input" };
  const src = input as Record<string, unknown>;

  if (src.name !== undefined && typeof src.name !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  const name = (src.name as string | undefined)?.trim();
  if (!name) return { ok: false, error: "name_required" };
  if (name.length > COFFEE_NAME_MAX) return { ok: false, error: "invalid_input" };

  const notes = optionalText(src.notes, COFFEE_NOTES_MAX);
  if (notes === undefined) return { ok: false, error: "invalid_input" };

  const certifications = normalizeCertifications(src.certifications, knownCertifications, mode);
  if (certifications === undefined) return { ok: false, error: "invalid_input" };

  const value = { name, notes, certifications } as NormalizedCoffeeFields;
  for (const f of TEXT_FIELDS) {
    const v = optionalText(src[f], COFFEE_FIELD_MAX);
    if (v === undefined) return { ok: false, error: "invalid_input" };
    value[f] = v;
  }
  return { ok: true, value };
}

export type WizardBoundsError = "too_many_coffees" | "invalid_coffee" | "invalid_label";

/** Bounds for the session wizard payload (coffees and sample labels). Returns
 *  the wizard's error code, or null. Run BEFORE any `.trim()` on client data. */
export function checkWizardBounds(
  coffees: unknown,
  samples: unknown,
  knownCertifications: readonly string[],
): WizardBoundsError | null {
  if (Array.isArray(coffees)) {
    if (coffees.length > MAX_WIZARD_COFFEES) return "too_many_coffees";
    for (const c of coffees) {
      if (typeof c !== "object" || c === null) return "invalid_coffee";
      const row = c as Record<string, unknown>;
      if (row.existingCoffeeId !== undefined && row.existingCoffeeId !== null) {
        // A linked coffee carries only an id; linkedCoffeesUsable re-validates access.
        if (typeof row.existingCoffeeId !== "string" || row.existingCoffeeId.length > 64) {
          return "invalid_coffee";
        }
        continue;
      }
      const checked = normalizeCoffeeFields(row, "create", knownCertifications);
      // A blank name is the wizard's own missing_coffee_fields check, not ours.
      if (!checked.ok && checked.error === "invalid_input") return "invalid_coffee";
    }
  }
  if (Array.isArray(samples)) {
    for (const s of samples) {
      if (typeof s !== "object" || s === null) return "invalid_label";
      const label = (s as Record<string, unknown>).label;
      if (label !== undefined && label !== null) {
        if (typeof label !== "string" || label.trim().length > SAMPLE_LABEL_MAX) {
          return "invalid_label";
        }
      }
    }
  }
  return null;
}

/** Optimistic-concurrency check for the coffee edit form (S8-10 T12,
 *  F-cafes-9). `expected` is the ISO `updatedAt` the form loaded with; absent
 *  = legacy caller that never sent one (no check). */
export function isStaleCoffeeEdit(current: Date, expected: string | undefined): boolean {
  if (expected === undefined) return false;
  const t = Date.parse(expected);
  if (Number.isNaN(t)) return true;
  return t !== current.getTime();
}
