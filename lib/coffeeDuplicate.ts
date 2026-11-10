// Explicit allow-list of the coffee fields "Duplicate" may copy (S8-02,
// F-cafes-3). Owner notes are private to the coffee's owner, so a copy made by
// someone else must NEVER inherit them; picking by name (instead of spreading
// the selected row) also means a future column cannot leak by being added to
// the select. Pure module — lives outside app/actions/coffees.ts because a
// "use server" file may only export async server actions.

export type DuplicableCoffeeFields = {
  country: string | null;
  region: string | null;
  farm: string | null;
  producer: string | null;
  species: string | null;
  variety: string | null;
  harvestYear: string | null;
  processType: string | null;
  altitude: string | null;
  roastLevel: string | null;
  certifications: string[];
};

export const DUPLICABLE_COFFEE_FIELDS = [
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
] as const satisfies readonly (keyof DuplicableCoffeeFields)[];

export function duplicableFields(source: Record<string, unknown>): DuplicableCoffeeFields {
  const str = (k: string): string | null => {
    const v = source[k];
    return typeof v === "string" ? v : null;
  };
  const certs = source.certifications;
  return {
    country: str("country"),
    region: str("region"),
    farm: str("farm"),
    producer: str("producer"),
    species: str("species"),
    variety: str("variety"),
    harvestYear: str("harvestYear"),
    processType: str("processType"),
    altitude: str("altitude"),
    roastLevel: str("roastLevel"),
    certifications: Array.isArray(certs) ? certs.filter((c): c is string => typeof c === "string") : [],
  };
}
