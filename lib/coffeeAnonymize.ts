// Single source of truth for what an "anonymized" (soft-deleted) coffee looks
// like. deleteCoffees (app/actions/coffees.ts) spreads ANONYMIZED_COFFEE_DATA
// into the updateMany that flips deletedAt; nothing else writes these fields
// on a deleted row because every owner-gated write filters on deletedAt: null.
//
// Wiped: name, code, farm, producer, notes, certifications — anything that
// identifies the lot or the people behind it. Visibility/sharing state is
// reset so the record cannot resurface as public/shared.
// Kept (on purpose): country, region, variety, species, processType,
// altitude, harvestYear, roastLevel — the analytical attributes that tasting
// data (evaluations, aggregate scores, history rows) must stay linked to.
//
// Pure module (no Prisma import) so it is unit-testable and safe to import
// from client bundles.

export const ANONYMIZED_COFFEE_DATA = {
  name: "",
  code: null,
  farm: null,
  producer: null,
  notes: null,
  certifications: [] as string[],
  visibility: "private",
  resultsPublished: false,
  resultsPublishedAt: null,
} as const;

/** Placeholder for contexts without next-intl (PDF routes, emails, analytics
 *  summaries). UI surfaces use `common.coffeeDeleted` from messages/*.json. */
export const DELETED_COFFEE_LABEL: Record<"es" | "en", string> = {
  es: "Café eliminado",
  en: "Coffee deleted",
};

export function deletedCoffeeLabel(locale: string): string {
  return locale === "en" ? DELETED_COFFEE_LABEL.en : DELETED_COFFEE_LABEL.es;
}

export function isCoffeeDeleted(coffee: {
  deletedAt: Date | string | null | undefined;
}): boolean {
  return coffee.deletedAt != null;
}

/** Display helper: the coffee's name, or `fallback` once it has been
 *  anonymized. A live coffee can never have a blank name (required at every
 *  create path), so sites that only select `name` still get the placeholder. */
export function coffeeDisplayName(
  coffee: { name: string; deletedAt?: Date | string | null } | null | undefined,
  fallback: string,
): string {
  if (!coffee) return fallback;
  if (coffee.deletedAt != null) return fallback;
  return coffee.name || fallback;
}
