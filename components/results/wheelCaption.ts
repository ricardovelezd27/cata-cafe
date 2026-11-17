// The one line a page may print with a flavour wheel: the families most people
// found, with the count and its n. It states what was counted and judges
// nothing: a panel that agreed on little reads "Floral, Verde/Vegetal y
// Nueces/Cacao · 2 de 7 cada una". Text only; the facts are `wheelHeadline`
// (lib/flavorWheelLayout.ts). Pure, so a server page and a test can both call it.

import { fillPattern } from "@/lib/fillPattern";
import type { WheelFamilyId } from "@/lib/flavorWheel";
import type { WheelHeadline } from "@/lib/flavorWheelLayout";
/** The words of that line, and of the two lines the full wheel prints itself. */
export type WheelCaptionStrings = {
  /** "{families} · {count} de {n}" */
  mostFound: string;
  /** "{families} · {count} de {n} cada una" (two or three families tied at the top) */
  mostFoundEach: string;
  /** "{k} familias · {count} de {n} cada una" (more than three tied: too many to name) */
  mostFoundMany: string;
  /** The small label over that line: "Lo más encontrado" */
  mostFoundLabel: string;
  /** Joins the last two names of a list: " y " */
  and: string;
  /** "{n} catadores" */
  cuppers: string;
  /** "1 catador" */
  cuppersOne: string;
  /** "Nadie eligió un sabor." */
  nobody: string;
};

/** More families than this tied at the top are counted, not named (a line, not a list). */
const MAX_NAMED = 3;

/** "A", "A y B", "A, B y C". */
export function joinNames(names: readonly string[], and: string): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")}${and}${names[names.length - 1]}`;
}

/** What separates the names from the tally in the three patterns above. */
const TALLY_MARK = " · ";

/**
 * A caption cut at its mark: "Verde/Vegetal y Tostado" and "5 de 7 cada una".
 * A component prints the tally on ONE line, so a narrow column never breaks
 * "5 de 7" in two or starts a line with the mark. `tally` is null for a caption
 * that has none ("Nadie eligió un sabor.").
 */
export function captionParts(text: string): { names: string; tally: string | null } {
  const at = text.lastIndexOf(TALLY_MARK);
  return at < 0
    ? { names: text, tally: null }
    : { names: text.slice(0, at), tally: text.slice(at + TALLY_MARK.length) };
}

export function wheelCaptionText(
  headline: WheelHeadline | null,
  familyLabels: Readonly<Record<WheelFamilyId, string>>,
  strings: WheelCaptionStrings,
): string {
  if (!headline) return strings.nobody;
  if (headline.families.length > MAX_NAMED) {
    return fillPattern(strings.mostFoundMany, {
      k: headline.families.length,
      count: headline.count,
      n: headline.n,
    });
  }
  const families = joinNames(
    headline.families.map((f) => familyLabels[f] ?? f),
    strings.and,
  );
  return fillPattern(headline.families.length > 1 ? strings.mostFoundEach : strings.mostFound, {
    families,
    count: headline.count,
    n: headline.n,
  });
}
