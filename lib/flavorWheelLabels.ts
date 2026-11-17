// The names of the flavour wheel's nodes in one language, for the results
// drawings (`FlavorWheel`, `CountedList`, `FlavorCompare`). They are reference
// data (`FLAVOR_WHEEL`, lib/constants.ts, bilingual), not interface strings, so
// they are not in the messages. Pure.

import { FLAVOR_WHEEL } from "@/lib/constants";
import { WHEEL_FAMILY_ORDER, type WheelFamilyId } from "@/lib/flavorWheel";

export type WheelLocale = "es" | "en";

/** Every wheel node's name, by node id. */
export function wheelNodeLabels(locale: WheelLocale): Record<string, string> {
  return Object.fromEntries(FLAVOR_WHEEL.map((node) => [node.id, locale === "en" ? node.label_en : node.label_es]));
}

/** The nine family names, in the wheel's order. */
export function wheelFamilyLabels(locale: WheelLocale): Record<WheelFamilyId, string> {
  const all = wheelNodeLabels(locale);
  return Object.fromEntries(WHEEL_FAMILY_ORDER.map((family) => [family, all[family] ?? family])) as Record<
    WheelFamilyId,
    string
  >;
}
