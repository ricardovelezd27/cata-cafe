/**
 * The plain-language lines under the coffee's lifetime score (S10 WP1c): the
 * coffee page and the coffee ficha PDF both render these, so they can never
 * disagree. Pure: it only RE-PRESENTS the numbers computeCoffeeLifetimeScore
 * already produced. Copy lives in messages (`coffee.lifetime`); LIFETIME_COPY
 * is the same text for the PDF, which has no next-intl, and a test keeps the
 * two equal. Number format as the rest of the app: a dot, two decimals for
 * scores (whole deductions print without decimals, as lib/scoreLine.ts does).
 * TODO(kim-validar:A2) TODO(kim-validar:A3)
 */
import { SENSORY_DEFECTS, type SensoryDefect } from "@/lib/constants";
import { roundToQuarter } from "@/lib/scoring";
import type { CoffeeLifetimeScore } from "@/lib/coffeeLifetimeScore";

export type LifetimeLabels = {
  title: string;
  accumulated: string; // "Acumulado de {cups} en {sessions}"
  cupOne: string;
  cupOther: string;
  sessionOne: string;
  sessionOther: string;
  voiceOne: string;
  voiceOther: string;
  base: string;
  and: string;
  defectiveOne: string;
  defectiveOther: string;
  nonUniformInlineOne: string; // "no uniforme" (in "1 taza defectuosa y 1 no uniforme")
  nonUniformInlineOther: string;
  tally: string; // "{defective} de {cupped} ({pct} %), {found} por {people}"
  noDefects: string; // "Sin tazas defectuosas en {cupped}"
  cuppedOne: string; // "taza catada"
  cuppedOther: string;
  foundOne: string; // "encontrada"
  foundOther: string;
  personOne: string;
  personOther: string;
  nonUniformCupOne: string; // "taza no uniforme"
  nonUniformCupOther: string;
  typePotato: string;
  typeMoldy: string;
  typePhenolic: string;
  typeUnspecified: string;
  indicativeBadge: string;
  indicativeNote: string;
  note: string;
  noBase: string;
};

export type LifetimeLines = {
  headline: string | null;
  accumulated: string;
  arithmetic: string | null;
  tally: string | null;
  byType: string | null;
  nonUniform: string | null;
  indicative: { badge: string; note: string } | null;
  note: string;
  noBase: string | null;
};

const MINUS = "−";

function amount(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

function pct(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

const phrase = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;
const isQuarter = (x: number) => Math.abs(x * 4 - Math.round(x * 4)) < 1e-9;

export function buildLifetimeLines(r: CoffeeLifetimeScore, L: LifetimeLabels): LifetimeLines {
  const hasBase = r.score !== null && r.base !== null;

  const accumulatedParts = [
    L.accumulated
      .replace("{cups}", phrase(r.cups, L.cupOne, L.cupOther))
      .replace("{sessions}", phrase(r.sessions, L.sessionOne, L.sessionOther)),
  ];
  if (r.voices > 0) accumulatedParts.push(phrase(r.voices, L.voiceOne, L.voiceOther));

  // "Base 84.00 − 0.75 (1 taza defectuosa y 1 no uniforme × 5/40) = 83.25". Scores are
  // rounded ONCE, to 0.25, after the deduction: when the deduction is a multiple
  // of 0.25 the base can be shown at 0.25 and the line adds up; otherwise the
  // exact base and the unrounded result are shown, then the rounded score.
  let arithmetic: string | null = null;
  if (hasBase && r.deduction > 0) {
    const score = r.score as number;
    const base = r.base as number;
    const flagged: string[] = [];
    if (r.tally.defective > 0) flagged.push(phrase(r.tally.defective, L.defectiveOne, L.defectiveOther));
    if (r.tally.nonUniform > 0) {
      flagged.push(phrase(r.tally.nonUniform, L.nonUniformInlineOne, L.nonUniformInlineOther));
    }
    const factorText = r.factor < 1 ? ` × 5/${amount(r.cups)}` : "";
    const term = `${MINUS} ${amount(r.deduction)} (${flagged.join(` ${L.and} `)}${factorText})`;
    const baseQ = roundToQuarter(base);
    const exact = isQuarter(r.deduction) && roundToQuarter(baseQ - r.deduction) === score;
    if (exact) {
      arithmetic = `${L.base} ${baseQ.toFixed(2)} ${term} = ${score.toFixed(2)}`;
    } else {
      const raw = base - r.deduction;
      arithmetic =
        raw.toFixed(2) === score.toFixed(2)
          ? `${L.base} ${base.toFixed(2)} ${term} = ${score.toFixed(2)}`
          : `${L.base} ${base.toFixed(2)} ${term} = ${raw.toFixed(2)} → ${score.toFixed(2)}`;
    }
  }

  const cupped = phrase(r.cups, L.cuppedOne, L.cuppedOther);
  let tally: string | null = null;
  if (r.cups > 0) {
    tally =
      r.tally.defective === 0
        ? L.noDefects.replace("{cupped}", cupped)
        : L.tally
            .replace("{defective}", phrase(r.tally.defective, L.defectiveOne, L.defectiveOther))
            .replace("{cupped}", cupped)
            .replace("{pct}", pct(r.tally.defectivePct ?? 0))
            .replace("{found}", r.tally.defective === 1 ? L.foundOne : L.foundOther)
            .replace("{people}", phrase(r.tally.foundBy, L.personOne, L.personOther));
  }

  const typeLabel: Record<SensoryDefect, string> = {
    potato: L.typePotato,
    moldy: L.typeMoldy,
    phenolic: L.typePhenolic,
  };
  const typeParts: string[] = [];
  for (const d of SENSORY_DEFECTS) {
    if (r.tally.byType[d] > 0) typeParts.push(`${typeLabel[d]} ${r.tally.byType[d]}`);
  }
  if (r.tally.unspecified > 0) typeParts.push(`${L.typeUnspecified} ${r.tally.unspecified}`);

  return {
    headline: hasBase ? (r.score as number).toFixed(2) : null,
    accumulated: accumulatedParts.join(" · "),
    arithmetic,
    tally,
    byType: typeParts.length > 0 ? typeParts.join(" · ") : null,
    nonUniform: r.tally.nonUniform > 0 ? phrase(r.tally.nonUniform, L.nonUniformCupOne, L.nonUniformCupOther) : null,
    indicative: r.indicative ? { badge: L.indicativeBadge, note: L.indicativeNote } : null,
    note: L.note,
    noBase: hasBase ? null : L.noBase,
  };
}

/** The same text as `coffee.lifetime` in messages/{es,en}.json (a test keeps them equal). */
export const LIFETIME_COPY: { es: LifetimeLabels; en: LifetimeLabels } = {
  es: {
    title: "Puntaje del café",
    accumulated: "Acumulado de {cups} en {sessions}",
    cupOne: "taza",
    cupOther: "tazas",
    sessionOne: "cata",
    sessionOther: "catas",
    voiceOne: "evaluación",
    voiceOther: "evaluaciones",
    base: "Base",
    and: "y",
    defectiveOne: "taza defectuosa",
    defectiveOther: "tazas defectuosas",
    nonUniformInlineOne: "no uniforme",
    nonUniformInlineOther: "no uniformes",
    tally: "{defective} de {cupped} ({pct} %), {found} por {people}",
    noDefects: "Sin tazas defectuosas en {cupped}",
    cuppedOne: "taza catada",
    cuppedOther: "tazas catadas",
    foundOne: "encontrada",
    foundOther: "encontradas",
    personOne: "persona",
    personOther: "personas",
    nonUniformCupOne: "taza no uniforme",
    nonUniformCupOther: "tazas no uniformes",
    typePotato: "Papa",
    typeMoldy: "Mohoso",
    typePhenolic: "Fenólico",
    typeUnspecified: "Sin especificar",
    indicativeBadge: "Indicativo",
    indicativeNote: "Menos de 5 tazas catadas: es una primera señal.",
    note: "Cada cata conserva su propio puntaje. Este número es del café y cambia cuando se cierra una cata nueva.",
    noBase:
      "Todavía no hay una cata completa de este café. Las impresiones rápidas (1 taza) cuentan sus tazas y defectos, no su puntaje.",
  },
  en: {
    title: "Coffee score",
    accumulated: "Accumulated from {cups} in {sessions}",
    cupOne: "cup",
    cupOther: "cups",
    sessionOne: "cupping",
    sessionOther: "cuppings",
    voiceOne: "evaluation",
    voiceOther: "evaluations",
    base: "Base",
    and: "and",
    defectiveOne: "defective cup",
    defectiveOther: "defective cups",
    nonUniformInlineOne: "non-uniform",
    nonUniformInlineOther: "non-uniform",
    tally: "{defective} of {cupped} ({pct} %), {found} by {people}",
    noDefects: "No defective cups in {cupped}",
    cuppedOne: "cup cupped",
    cuppedOther: "cups cupped",
    foundOne: "found",
    foundOther: "found",
    personOne: "person",
    personOther: "people",
    nonUniformCupOne: "non-uniform cup",
    nonUniformCupOther: "non-uniform cups",
    typePotato: "Potato",
    typeMoldy: "Moldy",
    typePhenolic: "Phenolic",
    typeUnspecified: "Unspecified",
    indicativeBadge: "Indicative",
    indicativeNote: "Fewer than 5 cups cupped: this is a first signal.",
    note: "Each cupping keeps its own score. This number belongs to the coffee and changes when a new cupping closes.",
    noBase:
      "There is no complete cupping of this coffee yet. Quick impressions (1 cup) count their cups and defects, not their score.",
  },
};
