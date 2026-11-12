// Optional per-sample preparation data (S10 WP2 / A9): roast date, a free
// "preparación" note (water, ratio, grind) and a "cupped outside protocol" tick
// with its note. Kim: the CVA asks to record the roast, the 8-24 h rest and, for
// transparency, any departure from protocol.
// TODO(kim-validar:A9): simulated answer; scope to confirm.
//
// BLIND DATA. A roast date or a preparation note can narrow a blind sample
// down to one coffee, so the four fields are OWNER-ONLY until the sample is
// revealed, exactly like extrinsic data: `gateSamplePrep` is the ONE rule the
// cup page, the results page, the CVA PDF and the print page share, and the
// columns are not in the PHASE 21 column GRANT (the browser key cannot read
// them). Display-only: never read by scoring, the trigger or AggregateScore.
//
// Pure and dependency-free except lib/validate (also pure).

import * as v from "@/lib/validate";

export const PREP_NOTE_MAX = 500;

/** The shape that travels to the UI / PDF. The date is "YYYY-MM-DD". */
export type SamplePrep = {
  roastDate: string | null;
  preparationNote: string | null;
  offProtocol: boolean;
  offProtocolNote: string | null;
};

/** The four columns as Prisma returns them. */
export type SamplePrepRow = {
  roastDate: Date | null;
  preparationNote: string | null;
  offProtocol: boolean;
  offProtocolNote: string | null;
};

export function hasSamplePrep(p: SamplePrep): boolean {
  return !!(p.roastDate || p.preparationNote || p.offProtocol || p.offProtocolNote);
}

/** The gate. Owner always; everyone else only once the sample is revealed. */
export function samplePrepVisible(viewer: { ownerView: boolean; revealed: boolean }): boolean {
  return viewer.ownerView || viewer.revealed;
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Row -> UI shape, or null when the owner entered nothing. */
export function toSamplePrep(row: SamplePrepRow): SamplePrep | null {
  const prep: SamplePrep = {
    roastDate: row.roastDate ? dateOnly(row.roastDate) : null,
    preparationNote: row.preparationNote?.trim() || null,
    offProtocol: row.offProtocol === true,
    offProtocolNote: row.offProtocol ? row.offProtocolNote?.trim() || null : null,
  };
  return hasSamplePrep(prep) ? prep : null;
}

/** What may leave the server for this viewer: the prep data or null. */
export function gateSamplePrep(
  row: SamplePrepRow,
  viewer: { ownerView: boolean; revealed: boolean },
): SamplePrep | null {
  return samplePrepVisible(viewer) ? toSamplePrep(row) : null;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const bad = (field: string): never => {
  throw new v.ValidationError(field);
};

/** `YYYY-MM-DD` that is a real calendar date and not in the future. Anything
 *  up to 14 hours ahead of UTC counts as "today" (an owner in UTC+13 whose day
 *  has already turned must be able to type their own today). Throws
 *  invalid_input. Returns the date at 00:00 UTC (a Postgres DATE). */
export function parseRoastDate(value: unknown, now: number = Date.now()): Date {
  if (typeof value !== "string") return bad("roastDate");
  const m = DATE_RE.exec(value.trim());
  if (!m) return bad("roastDate");
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const real =
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3]);
  const latest = dateOnly(new Date(now + 14 * 3_600_000));
  if (!real || dateOnly(d) > latest || Number(m[1]) < 1990) {
    return bad("roastDate");
  }
  return d;
}

/** What the owner may post for a sample's prep data. MERGE semantics (same as
 *  updateSampleMetadata's coffee fields): an ABSENT key leaves the column
 *  alone, "" (or null) clears it. */
export type SamplePrepInput = {
  roastDate?: string | null;
  preparationNote?: string | null;
  offProtocol?: boolean;
  offProtocolNote?: string | null;
};

/** Columns to write (Prisma `data`); only keys that must change are present. */
export type SamplePrepUpdate = {
  roastDate?: Date | null;
  preparationNote?: string | null;
  offProtocol?: boolean;
  offProtocolNote?: string | null;
};

/** Validates the prep keys of an input (throws invalid_input) and returns the
 *  columns to write. Unticking "off protocol" also clears its note. */
export function parseSamplePrepInput(input: SamplePrepInput, now: number = Date.now()): SamplePrepUpdate {
  const out: SamplePrepUpdate = {};
  if (input.roastDate !== undefined) {
    out.roastDate =
      input.roastDate === null || String(input.roastDate).trim() === ""
        ? null
        : parseRoastDate(input.roastDate, now);
  }
  if (input.preparationNote !== undefined) {
    out.preparationNote = v.str(input.preparationNote, "preparationNote", {
      max: PREP_NOTE_MAX,
      required: false,
    });
  }
  if (input.offProtocol !== undefined) {
    if (typeof input.offProtocol !== "boolean") bad("offProtocol");
    out.offProtocol = input.offProtocol;
    if (input.offProtocol === false) out.offProtocolNote = null;
  }
  if (input.offProtocolNote !== undefined && out.offProtocol !== false) {
    out.offProtocolNote = v.str(input.offProtocolNote, "offProtocolNote", {
      max: PREP_NOTE_MAX,
      required: false,
    });
  }
  return out;
}

/** The prep fields as the owner's sample editor holds them (all strings, "" =
 *  empty). The editor posts them as-is: "" clears a column. */
export type SamplePrepForm = {
  roastDate: string;
  preparationNote: string;
  offProtocol: boolean;
  offProtocolNote: string;
};

export function prepToForm(p: SamplePrep | null | undefined): SamplePrepForm {
  return {
    roastDate: p?.roastDate ?? "",
    preparationNote: p?.preparationNote ?? "",
    offProtocol: p?.offProtocol ?? false,
    offProtocolNote: p?.offProtocolNote ?? "",
  };
}

/** Editor state -> the UI shape after a save (null when everything is empty). */
export function prepFromForm(f: Partial<SamplePrepForm>): SamplePrep | null {
  const prep: SamplePrep = {
    roastDate: f.roastDate?.trim() || null,
    preparationNote: f.preparationNote?.trim() || null,
    offProtocol: f.offProtocol === true,
    offProtocolNote: f.offProtocol === true ? f.offProtocolNote?.trim() || null : null,
  };
  return hasSamplePrep(prep) ? prep : null;
}

/** True when the update touches any prep column. */
export function touchesSamplePrep(u: SamplePrepUpdate): boolean {
  return Object.keys(u).length > 0;
}

/** The prep keys of an arbitrary input object, for callers that receive the
 *  union of coffee and prep fields (updateSampleMetadata). */
export function pickSamplePrepInput(input: Record<string, unknown>): SamplePrepInput {
  const out: SamplePrepInput = {};
  if ("roastDate" in input) out.roastDate = input.roastDate as string | null;
  if ("preparationNote" in input) out.preparationNote = input.preparationNote as string | null;
  if ("offProtocol" in input) out.offProtocol = input.offProtocol as boolean;
  if ("offProtocolNote" in input) out.offProtocolNote = input.offProtocolNote as string | null;
  return out;
}
