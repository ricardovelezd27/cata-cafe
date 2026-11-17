// Invented cupping panels for the flavour wheel drawings: shared by the tests
// (tests/pdfFlavorWheel.test.ts, tests/resultsParts.test.ts), the PDF preview
// (scripts/render-wheel-preview.tsx) and the dev page of the results parts
// (app/[locale]/dev/results-parts), so what a person looks at and what a test
// renders are the same data. (Moved here from tests/helpers in package R1b so a
// page may import it; the panels are unchanged.)
// Every coffee, cupper and count is made up. One list of wheel node ids per cupper.
import { FLAVOR_WHEEL } from "@/lib/constants";
import { WHEEL_FAMILY_ORDER, countWheelPeople, type WheelFamilyId, type WheelPeople } from "@/lib/flavorWheel";

const BERRY = "fruity:berry";
export const BLACKBERRY = "fruity:berry:blackberry";
const CITRUS = "fruity:citrus";
const JASMINE = "floral:floral:jasmine";
const TEA = "floral:black_tea";
export const HONEY = "sweet:brown_sugar:honey";
const CARAMEL = "sweet:brown_sugar:caramelized";
const WINEY = "sour_fermented:alcohol_fermented";
const HERB = "green_veg:fresh";
const NUT = "nutty_cocoa:nutty";
const COCOA = "nutty_cocoa:cocoa";
const SPICE = "spice:brown_spice";
const CEREAL = "roasted:cereal";
const SMOKE = "roasted:burnt";
const PAPER = "other:papery_musty";

export const WHEEL_FIXTURES = {
  /** Seven cuppers, a clear leader: a natural with red fruit. */
  ambar: countWheelPeople([
    [BLACKBERRY, JASMINE, HONEY],
    [BERRY, CITRUS, HONEY, WINEY],
    [BLACKBERRY, JASMINE, CARAMEL],
    [BERRY, CITRUS, JASMINE],
    [BLACKBERRY, HONEY, WINEY, SPICE],
    [BERRY, CITRUS, JASMINE, HONEY],
    [BLACKBERRY, TEA, CARAMEL, WINEY, NUT],
  ]),
  /** Seven cuppers who agreed on little: every family has one or two people. */
  niebla: countWheelPeople([
    [JASMINE, HERB],
    [CITRUS, NUT],
    [HONEY, PAPER],
    [TEA, CEREAL],
    [BERRY, SPICE],
    [NUT, WINEY],
    [HERB, CARAMEL],
  ]),
  /** Seven cuppers, a washed coffee with a defect: green and roasted lead. */
  musgo: countWheelPeople([
    [HERB, SMOKE, PAPER],
    [HERB, CEREAL],
    [HERB, SMOKE, WINEY],
    [HERB, PAPER, NUT],
    [HERB, CEREAL, WINEY],
    [SMOKE, PAPER, NUT],
    [CITRUS, HONEY],
  ]),
  /** Six cuppers (one did not send this sample): cocoa and nuts, one family unanimous. */
  cedro: countWheelPeople([
    [COCOA, NUT, CARAMEL],
    [COCOA, CARAMEL, CEREAL],
    [COCOA, NUT, SPICE],
    [NUT, HONEY, CEREAL],
    [COCOA, CARAMEL, CITRUS],
    [COCOA, NUT, HONEY, SPICE, JASMINE],
  ]),
  /** Three cuppers: the smallest panel a participant sees. */
  tres: countWheelPeople([
    [BLACKBERRY, HONEY],
    [BERRY, JASMINE],
    [CITRUS, HONEY, NUT],
  ]),
  /** Four cuppers. */
  cuatro: countWheelPeople([
    [JASMINE, TEA, HONEY],
    [JASMINE, CITRUS],
    [TEA, HONEY, HERB],
    [JASMINE, CARAMEL],
  ]),
  /** Twelve cuppers: the rings become quarters of the panel. */
  doce: countWheelPeople(
    Array.from({ length: 12 }, (_, i) => [
      i < 10 ? BERRY : CITRUS,
      ...(i % 2 === 0 ? [JASMINE] : []),
      ...(i % 3 === 0 ? [HONEY, COCOA] : [CARAMEL]),
      ...(i % 4 === 0 ? [WINEY] : []),
      ...(i === 5 ? [HERB] : []),
      ...(i > 8 ? [SPICE] : []),
    ]),
  ),
  /** Seven cuppers, nobody picked a flavour. */
  nadie: countWheelPeople(Array.from({ length: 7 }, () => [])),
  /** Nobody cupped it at all. */
  vacio: countWheelPeople([]),
} satisfies Record<string, WheelPeople>;

export type WheelFixtureName = keyof typeof WHEEL_FIXTURES;

/** Every wheel node's name in one language (the page resolves these; the drawings never do). */
export function wheelNodeLabels(locale: "es" | "en"): Record<string, string> {
  return Object.fromEntries(FLAVOR_WHEEL.map((n) => [n.id, locale === "en" ? n.label_en : n.label_es]));
}

/** The nine family names in one language. */
export function wheelFamilyLabels(locale: "es" | "en"): Record<WheelFamilyId, string> {
  const all = wheelNodeLabels(locale);
  return Object.fromEntries(WHEEL_FAMILY_ORDER.map((f) => [f, all[f]])) as Record<WheelFamilyId, string>;
}
