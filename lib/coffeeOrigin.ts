// What counts as "origin data" of a coffee, and when it was really edited (S10 WP5a,
// F-cafes-9, review M1). `coffees.updatedAt` also moves on publish, visibility,
// invites, guest claim and anonymize, so it cannot say "origin edited". The real
// column is `Coffee.originEditedAt`, stamped ONLY when one of these fields changes
// (`updateCoffee`, `updateSampleMetadata` on an existing coffee). Nothing else
// stamps it; a new coffee starts NULL. Pure and dependency-free.

/** Exactly the coffee fields the origin/extrinsic blocks of the surfaces print:
 *  the CVA sheet and the coffee ficha identity + origin block (country, region,
 *  farm, producer, species, variety, harvest, process, altitude, certifications)
 *  and the roast level the sheet and ficha show next to the coffee. `name`,
 *  `notes`, visibility, results flags and the code are NOT origin data. */
export const COFFEE_ORIGIN_FIELDS = [
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
  "certifications",
] as const;

type OriginValue = string | string[] | null | undefined;
export type CoffeeOriginRecord = Partial<Record<(typeof COFFEE_ORIGIN_FIELDS)[number], OriginValue>>;

function scalar(v: OriginValue): string {
  if (Array.isArray(v)) return "";
  return (v ?? "").trim();
}

function asSet(v: OriginValue): string {
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return JSON.stringify([...new Set(list.map((x) => x.trim()).filter(Boolean))].sort());
}

/** True when any origin field differs between `before` and `after`. Normalised:
 *  trimmed, null = "" = undefined, the certification list compared as a set.
 *  A key ABSENT from `after` is "not edited" (merge semantics), never a clear. */
export function originFieldsChanged(
  before: CoffeeOriginRecord,
  after: CoffeeOriginRecord,
): boolean {
  for (const f of COFFEE_ORIGIN_FIELDS) {
    if (!(f in after) || after[f] === undefined) continue;
    if (f === "certifications") {
      if (asSet(before[f]) !== asSet(after[f])) return true;
    } else if (scalar(before[f]) !== scalar(after[f])) {
      return true;
    }
  }
  return false;
}
