// Invented cuppings for the organizer's Panel (package R5): the review board
// (`/dev/results-parts?only=panel`) and the tests draw the Panel from these.
// No database, no session, no account. Every name is made up.
//
// The values go through the real rules: a cupper's total through
// `buildPanelMatrix` (-> `calcIndividualScore`), the group's score as the mean
// of the included totals (what the board passes as "the card's score").

import type { CupperAlignmentRow } from "@/components/results/CupperAlignment";
import type { ParticipantResult } from "@/components/results/OwnerParticipantSection";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import type { CupperPostCloseNote, OwnerLateRow } from "@/lib/lateContributions";
import { buildPanelMatrix } from "@/lib/reports/panel";

export type PanelFixture = {
  id: string;
  title: { es: string; en: string };
  format: "affective" | "combined" | "descriptive";
  participants: ParticipantResult[];
  /** The score each coffee's card would show: the mean of the included totals. */
  groupScores: Record<string, number | null>;
  lateRows: OwnerLateRow[];
  notes: Record<string, Record<string, CupperPostCloseNote>>;
  alignment: CupperAlignmentRow[];
  samples: { id: string; label: string }[];
};

const NAMES = [
  "Ana Restrepo",
  "Beto Cifuentes",
  "Carolina Mejía",
  "Daniel Ospina",
  "Eva Londoño",
  "Federico Arango",
  "Gloria Henao",
  "Hernán Vélez",
  "Irene Cardona",
  "Julián Zapata",
  "Karen Múnera",
  "Luis Betancur",
  "Marta Giraldo",
  "Nicolás Uribe",
];

/** Every quality attribute rated around `level`, one step lower on the odd ones when `tilt`. */
function rated(level: number, tilt: boolean): Record<string, unknown> {
  if (level === 0) return {};
  return Object.fromEntries(
    AFFECTIVE_ATTRIBUTES.map((a, i) => [`${a.id}_final`, Math.max(1, Math.min(9, tilt && i % 2 === 1 ? level - 1 : level))]),
  );
}

function build(input: {
  id: string;
  title: { es: string; en: string };
  format: PanelFixture["format"];
  coffees: { label: string; name?: string; reference?: boolean }[];
  /** Per cupper: a level per coffee (0 = sent nothing, -1 = a declared partial). */
  levels: number[][];
  excluded?: number[];
  late?: { cupper: number; coffee: number; level: number; receivedLate: boolean }[];
  notes?: { cupper: number; coffee: number; text: string }[];
}): PanelFixture {
  const samples = input.coffees.map((c, i) => ({ id: `${input.id}-s${i}`, label: c.label }));
  const participants: ParticipantResult[] = input.levels.map((row, ci) => {
    const excluded = input.excluded?.includes(ci) ?? false;
    return {
      id: `${input.id}-c${ci}`,
      name: NAMES[ci % NAMES.length],
      excluded,
      trail: excluded ? { at: "12 nov 2026", by: NAMES[0], reason: "sample_error" } : null,
      samples: input.coffees.map((coffee, si) => {
        const level = row[si] ?? 0;
        const data =
          level === -1
            ? { ...rated(6, false), [`${AFFECTIVE_ATTRIBUTES[0].id}_final`]: undefined, [`${AFFECTIVE_ATTRIBUTES[0].id}_ne`]: true }
            : rated(level, (ci + si) % 3 === 0);
        const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
        return {
          id: samples[si].id,
          label: coffee.label,
          revealed: !!coffee.name,
          coffee: coffee.name ? { name: coffee.name } : null,
          descriptive: input.format === "descriptive" && level > 0 ? { fragancia_intensidad: 8 } : {},
          affective: input.format === "affective" ? clean : {},
          combined: input.format === "combined" ? clean : {},
          isReference: coffee.reference === true,
          referenceRank: coffee.reference ? 1 : null,
        };
      }),
    };
  });
  const matrix = buildPanelMatrix({ participants, format: input.format, cupsPerSample: 2 });
  const groupScores = Object.fromEntries(
    matrix.coffees.map((coffee, si) => {
      const included = matrix.cells[si]
        .filter((_, pi) => !matrix.cuppers[pi].excluded)
        .map((c) => c.value)
        .filter((v): v is number => v !== null);
      const mean = included.length ? included.reduce((a, b) => a + b, 0) / included.length : null;
      return [coffee.id, mean === null ? null : Math.round(mean * 4) / 4];
    }),
  );
  const lateRows: OwnerLateRow[] = (input.late ?? []).map((l, i) => {
    const total = 0.65625 * 8 * l.level + 52.75;
    const group = groupScores[samples[l.coffee].id];
    return {
      evaluationId: `${input.id}-late${i}`,
      cupperName: NAMES[l.cupper % NAMES.length],
      sampleId: samples[l.coffee].id,
      sampleLabel: samples[l.coffee].label,
      savedAt: "2026-11-12T16:40:00.000Z",
      updatedAt: "2026-11-12T16:40:00.000Z",
      receivedLate: l.receivedLate,
      individualScore: total,
      groupScore: group,
      diff: group === null ? null : Math.round((total - group) * 100) / 100,
      ratings: AFFECTIVE_ATTRIBUTES.map((a) => ({ id: a.id, value: l.level })),
      oldRule: false,
    };
  });
  const notes: PanelFixture["notes"] = {};
  for (const n of input.notes ?? []) {
    const cupperId = participants[n.cupper].id;
    (notes[cupperId] ??= {})[samples[n.coffee].id] = { text: n.text, at: "2026-11-13T09:15:00.000Z" };
  }
  // An invented share per cupper and coffee, spread from high to low.
  const alignment: CupperAlignmentRow[] =
    input.format === "affective"
      ? []
      : participants.map((p, ci) => {
          const bySample = Object.fromEntries(
            samples.map((s, si) => {
              const opportunities = 5 + ((si * 2) % 3);
              const matches = Math.max(0, Math.min(opportunities, opportunities - ((ci * 2 + si) % (opportunities + 1))));
              return [s.id, { matches, opportunities }];
            }),
          );
          const matches = Object.values(bySample).reduce((sum, v) => sum + v.matches, 0);
          const opportunities = Object.values(bySample).reduce((sum, v) => sum + v.opportunities, 0);
          return { id: p.id, name: p.name, excluded: p.excluded, matches, opportunities, alignment: matches / opportunities, bySample };
        });
  return {
    id: input.id,
    title: input.title,
    format: input.format,
    participants,
    groupScores,
    lateRows,
    notes,
    alignment,
    samples,
  };
}

/** Seven cuppers, six coffees: one cupper excluded, one far from the group, one
 *  declared partial, a reference; a late evaluation of each kind; two notes. */
export const PANEL_CLASS: PanelFixture = build({
  id: "class",
  title: { es: "Siete catadores, seis cafés", en: "Seven cuppers, six coffees" },
  format: "combined",
  coffees: [
    { label: "Muestra E", name: "Referencia de la casa", reference: true },
    { label: "Muestra G", name: "Ámbar" },
    { label: "Muestra C", name: "Granate" },
    { label: "Muestra A" },
    { label: "Muestra B" },
    { label: "Muestra D" },
  ],
  levels: [
    [5, 8, 8, 7, 6, 4],
    [5, 9, 8, 6, 6, 5],
    [5, 8, 8, 7, 5, 4],
    [5, 7, 8, 7, 6, 4],
    [5, 8, 7, 6, 6, 5],
    [5, 8, 8, 7, 9, 4],
    [5, 4, -1, 7, 6, 0],
  ],
  excluded: [6],
  late: [
    { cupper: 3, coffee: 5, level: 5, receivedLate: false },
    { cupper: 4, coffee: 1, level: 9, receivedLate: true },
  ],
  notes: [
    { cupper: 1, coffee: 1, text: "Me costó separar la acidez del dulzor en esta taza. La volvería a catar más fría." },
    { cupper: 2, coffee: 4, text: "La encontré más plana que el grupo." },
  ],
});

/** Fourteen cuppers, eight coffees: the size a class has. */
export const PANEL_LARGE: PanelFixture = build({
  id: "large",
  title: { es: "Catorce catadores, ocho cafés", en: "Fourteen cuppers, eight coffees" },
  format: "affective",
  coffees: ["A", "B", "C", "D", "E", "F", "G", "H"].map((letter) => ({ label: `Muestra ${letter}` })),
  levels: Array.from({ length: 14 }, (_, ci) =>
    Array.from({ length: 8 }, (_, si) => {
      const base = [8, 7, 6, 7, 5, 8, 6, 7][si];
      // a few cuppers a step or two away, so the marks appear
      const shift = (ci * 3 + si * 5) % 11 === 0 ? -2 : (ci + si * 2) % 7 === 0 ? 1 : 0;
      return Math.max(1, Math.min(9, base + shift));
    }),
  ),
  excluded: [12],
});

/** Two cuppers: no spread worth a distance, no marks. */
export const PANEL_TWO: PanelFixture = build({
  id: "two",
  title: { es: "Dos catadores", en: "Two cuppers" },
  format: "combined",
  coffees: [{ label: "Muestra A" }, { label: "Muestra B" }, { label: "Muestra C" }],
  levels: [
    [7, 6, 8],
    [7, 7, 5],
  ],
});

/** A descriptive session: no totals, the cells only open an evaluation. */
export const PANEL_DESCRIPTIVE: PanelFixture = build({
  id: "descriptive",
  title: { es: "Sesión descriptiva", en: "Descriptive session" },
  format: "descriptive",
  coffees: [{ label: "Muestra A" }, { label: "Muestra B" }],
  levels: [
    [6, 6],
    [6, 0],
    [6, 6],
  ],
});

export const PANEL_FIXTURES: readonly PanelFixture[] = [PANEL_CLASS, PANEL_LARGE, PANEL_TWO, PANEL_DESCRIPTIVE];
