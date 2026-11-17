// The one line a page may print with a flavour wheel: the families most people
// found, with the count and its n. It states what was counted and judges
// nothing: a panel that agreed on little reads "Floral, Verde/Vegetal y
// Nueces/Cacao · 2 de 7 cada una". Text only; the facts are `wheelHeadline`
// (lib/flavorWheelLayout.ts). Pure, so a server page and a test can both call it.

import { fillPattern } from "@/lib/fillPattern";
import type { WheelFamilyId } from "@/lib/flavorWheel";
import type { WheelHeadline } from "@/lib/flavorWheelLayout";
import type { ResultsPartsStrings } from "./partsStrings";

/** More families than this tied at the top are counted, not named (a line, not a list). */
const MAX_NAMED = 3;

/** "A", "A y B", "A, B y C". */
export function joinNames(names: readonly string[], and: string): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")}${and}${names[names.length - 1]}`;
}

export function wheelCaptionText(
  headline: WheelHeadline | null,
  familyLabels: Readonly<Record<WheelFamilyId, string>>,
  strings: Pick<ResultsPartsStrings, "caption" | "counted">,
): string {
  if (!headline) return strings.counted.nobody;
  if (headline.families.length > MAX_NAMED) {
    return fillPattern(strings.caption.mostFoundMany, {
      k: headline.families.length,
      count: headline.count,
      n: headline.n,
    });
  }
  const families = joinNames(
    headline.families.map((f) => familyLabels[f] ?? f),
    strings.caption.and,
  );
  return fillPattern(headline.families.length > 1 ? strings.caption.mostFoundEach : strings.caption.mostFound, {
    families,
    count: headline.count,
    n: headline.n,
  });
}
