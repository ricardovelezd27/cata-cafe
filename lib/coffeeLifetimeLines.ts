/**
 * The plain-language lines under the coffee's lifetime score (S10 WP1c): the
 * coffee page and the coffee ficha PDF both render these, so they can never
 * disagree. Pure: it only RE-PRESENTS the numbers computeCoffeeLifetimeScore
 * already produced. Copy lives in messages (`coffee.lifetime`); LIFETIME_COPY
 * is the same text for the PDF, which has no next-intl, and a test keeps the
 * two equal. Number format as the rest of the app: a dot, two decimals.
 *
 * The arithmetic line is NOT an equation (fix of review #132, M2): rounding the
 * parts on their own makes "a − b = c" look wrong, so it is one labelled line,
 * "Base 84.00 · Descuento 0.75 (1 taza defectuosa) · Puntaje 83.25", and the
 * fixed rounding note says the score is rounded to the nearest quarter point.
 * TODO(kim-validar:A2) TODO(kim-validar:A3)
 */
import { SENSORY_DEFECTS, type SensoryDefect } from "@/lib/constants";
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
  deduction: string;
  scoreWord: string;
  roundingNote: string;
  defectiveOne: string;
  defectiveOther: string;
  nonUniformOnlyOne: string; // "taza no uniforme (sin defecto)"
  nonUniformOnlyOther: string;
  nonUniformReasonOne: string; // "taza no uniforme sin defecto" (inside the deduction's reason)
  nonUniformReasonOther: string;
  tally: string; // "{defective} de {cupped} ({pct} %), {found} por {people}"
  noDefects: string; // "Sin tazas defectuosas en {cupped}"
  cuppedOne: string;
  cuppedOther: string;
  foundOne: string;
  foundOther: string;
  personOne: string;
  personOther: string;
  typePotato: string;
  typeMoldy: string;
  typePhenolic: string;
  typeUnspecified: string;
  indicativeBadge: string;
  indicativeNote: string;
  anchorOne: string; // "{n} cata en la que …"
  anchorOther: string;
  note: string;
  noBaseQuick: string;
  noBaseAnchor: string;
  noBaseIncomplete: string;
};

export type LifetimeLines = {
  headline: string | null;
  /** Fixed note under the headline: the score is rounded to the nearest quarter point. */
  roundingNote: string | null;
  /** Null when no cup was cupped ("0 tazas en 0 catas" is never printed). */
  accumulated: string | null;
  arithmetic: string | null;
  tally: string | null;
  byType: string | null;
  nonUniform: string | null;
  indicative: { badge: string; note: string } | null;
  anchorNote: string | null;
  note: string;
  noBase: string | null;
};

const phrase = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

function pct(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function buildLifetimeLines(r: CoffeeLifetimeScore, L: LifetimeLabels): LifetimeLines {
  const hasBase = r.score !== null && r.base !== null;

  let accumulated: string | null = null;
  if (r.cups > 0) {
    const parts = [
      L.accumulated
        .replace("{cups}", phrase(r.cups, L.cupOne, L.cupOther))
        .replace("{sessions}", phrase(r.sessions, L.sessionOne, L.sessionOther)),
    ];
    if (r.voices > 0) parts.push(phrase(r.voices, L.voiceOne, L.voiceOther));
    accumulated = parts.join(" · ");
  }

  // The three numbers are the function's own base, deduction and score, each
  // printed with two decimals; no "=", no "−", no arrow between rounded numbers.
  let arithmetic: string | null = null;
  if (hasBase) {
    const base = (r.base as number).toFixed(2);
    const score = (r.score as number).toFixed(2);
    if (r.deduction > 0) {
      const reason: string[] = [];
      if (r.tally.defective > 0) reason.push(phrase(r.tally.defective, L.defectiveOne, L.defectiveOther));
      if (r.tally.nonUniformOnly > 0) {
        reason.push(phrase(r.tally.nonUniformOnly, L.nonUniformReasonOne, L.nonUniformReasonOther));
      }
      arithmetic = `${L.base} ${base} · ${L.deduction} ${r.deduction.toFixed(2)} (${reason.join(", ")}) · ${L.scoreWord} ${score}`;
    } else {
      arithmetic = `${L.base} ${base} · ${L.scoreWord} ${score}`;
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

  const noBase = hasBase
    ? null
    : r.noBaseReason === "quick"
      ? L.noBaseQuick
      : r.noBaseReason === "anchor"
        ? L.noBaseAnchor
        : L.noBaseIncomplete;

  return {
    headline: hasBase ? (r.score as number).toFixed(2) : null,
    roundingNote: hasBase ? L.roundingNote : null,
    accumulated,
    arithmetic,
    tally,
    byType: typeParts.length > 0 ? typeParts.join(" · ") : null,
    nonUniform:
      r.tally.nonUniformOnly > 0
        ? phrase(r.tally.nonUniformOnly, L.nonUniformOnlyOne, L.nonUniformOnlyOther)
        : null,
    indicative: r.indicative && r.cups > 0 ? { badge: L.indicativeBadge, note: L.indicativeNote } : null,
    anchorNote:
      r.anchorReferenceSessions > 0
        ? (r.anchorReferenceSessions === 1 ? L.anchorOne : L.anchorOther).replace(
            "{n}",
            String(r.anchorReferenceSessions),
          )
        : null,
    note: L.note,
    noBase,
  };
}

/** The same text as `coffee.lifetime` in messages/{es,en}.json (a test keeps them equal). */
export const LIFETIME_COPY: { es: LifetimeLabels; en: LifetimeLabels } = {
  es: {
    title: "Puntaje Café Sensible (base CVA)",
    accumulated: "Acumulado de {cups} en {sessions}",
    cupOne: "taza",
    cupOther: "tazas",
    sessionOne: "cata",
    sessionOther: "catas",
    voiceOne: "evaluación",
    voiceOther: "evaluaciones",
    base: "Base",
    deduction: "Descuento",
    scoreWord: "Puntaje",
    roundingNote: "El puntaje se redondea al cuarto de punto más cercano.",
    defectiveOne: "taza defectuosa",
    defectiveOther: "tazas defectuosas",
    nonUniformOnlyOne: "taza no uniforme (sin defecto)",
    nonUniformOnlyOther: "tazas no uniformes (sin defecto)",
    nonUniformReasonOne: "taza no uniforme sin defecto",
    nonUniformReasonOther: "tazas no uniformes sin defecto",
    tally: "{defective} de {cupped} ({pct} %), {found} por {people}",
    noDefects: "Sin tazas defectuosas en {cupped}",
    cuppedOne: "taza catada",
    cuppedOther: "tazas catadas",
    foundOne: "encontrada",
    foundOther: "encontradas",
    personOne: "persona",
    personOther: "personas",
    typePotato: "Papa",
    typeMoldy: "Mohoso",
    typePhenolic: "Fenólico",
    typeUnspecified: "Sin especificar",
    indicativeBadge: "Indicativo",
    indicativeNote: "Menos de 5 tazas catadas: es una primera señal.",
    anchorOne: "{n} cata en la que este café fue la referencia fija no cuenta para este puntaje.",
    anchorOther: "{n} catas en las que este café fue la referencia fija no cuentan para este puntaje.",
    note: "Cada cata conserva su propio puntaje. Este número es del café y cambia cuando se cierra una cata nueva.",
    noBaseQuick:
      "Todavía no hay una cata completa de este café. Las impresiones rápidas (1 taza) cuentan sus tazas y defectos, no su puntaje.",
    noBaseAnchor: "Este café solo se ha catado como referencia fija: esas catas no cuentan para este puntaje.",
    noBaseIncomplete: "Todavía no hay una cata completa de este café.",
  },
  en: {
    title: "Café Sensible score (CVA-based)",
    accumulated: "Accumulated from {cups} in {sessions}",
    cupOne: "cup",
    cupOther: "cups",
    sessionOne: "cupping",
    sessionOther: "cuppings",
    voiceOne: "evaluation",
    voiceOther: "evaluations",
    base: "Base",
    deduction: "Deduction",
    scoreWord: "Score",
    roundingNote: "The score is rounded to the nearest quarter point.",
    defectiveOne: "defective cup",
    defectiveOther: "defective cups",
    nonUniformOnlyOne: "non-uniform cup (not defective)",
    nonUniformOnlyOther: "non-uniform cups (not defective)",
    nonUniformReasonOne: "non-uniform cup, not defective",
    nonUniformReasonOther: "non-uniform cups, not defective",
    tally: "{defective} of {cupped} ({pct} %), {found} by {people}",
    noDefects: "No defective cups in {cupped}",
    cuppedOne: "cup cupped",
    cuppedOther: "cups cupped",
    foundOne: "found",
    foundOther: "found",
    personOne: "person",
    personOther: "people",
    typePotato: "Potato",
    typeMoldy: "Moldy",
    typePhenolic: "Phenolic",
    typeUnspecified: "Unspecified",
    indicativeBadge: "Indicative",
    indicativeNote: "Fewer than 5 cups cupped: this is a first signal.",
    anchorOne: "{n} cupping where this coffee was the fixed reference does not count toward this score.",
    anchorOther: "{n} cuppings where this coffee was the fixed reference do not count toward this score.",
    note: "Each cupping keeps its own score. This number belongs to the coffee and changes when a new cupping closes.",
    noBaseQuick:
      "There is no complete cupping of this coffee yet. Quick impressions (1 cup) count their cups and defects, not their score.",
    noBaseAnchor: "This coffee has only been cupped as the fixed reference: those cuppings do not count toward this score.",
    noBaseIncomplete: "There is no complete cupping of this coffee yet.",
  },
};
