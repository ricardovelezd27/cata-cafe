// Invented cuppings for the results overview (package R2), used by its tests
// (tests/resultsOverview.test.ts) and by the dev board
// (app/[locale]/dev/results-parts). No database: every coffee, cupper and number
// is made up. Each scenario is built the way the page builds it: the evaluations
// go through the REAL `computeGroupAggregate` and the REAL `buildOverviewData`,
// so what a scenario shows is what the page would show for that data.
//
// Why they exist: the test accounts own no closed group session with several
// cuppers, so "a participant looking at a closed cupping", a free-mode
// reference, a tie and a panel of two can only be looked at here.

import { AFFECTIVE_ATTRIBUTES, type SessionFormat } from "@/lib/constants";
import type { MyEvaluation } from "@/lib/evaluationState";
import { buildOverviewData, type OverviewData, type OverviewRow } from "@/lib/reports/overview";
import type { RankContext } from "@/lib/reports/ranking";
import { computeGroupAggregate } from "@/lib/scoring";

export type FixtureSample = {
  id: string;
  label: string;
  revealed: boolean;
  coffee: { name: string } | null;
  descriptive: Record<string, unknown>;
  affective: Record<string, unknown>;
  combined: Record<string, unknown>;
  aggregateScore: {
    communityScore: number | null;
    scoreSd: number | null;
    participantCount: number;
    submittedCount: number;
    totalSubmitted: number;
    totalCups: number;
    /** The group's average per quality attribute, by the attribute's own label. */
    attrAverages: Record<string, number>;
  } | null;
  myEvaluation: MyEvaluation;
  referenceRank: number | null;
};

export type OverviewScenario = {
  id: string;
  title: { es: string; en: string };
  samples: FixtureSample[];
  ctx: RankContext;
  referenceId: string | null;
  data: OverviewData;
  myAlignment: { matches: number; opportunities: number } | null;
  preliminary: boolean;
  referencePinned: boolean;
  /** The session is closed: "Comparar" exists only then. */
  closed: boolean;
  /** The session's reference mode (the words of the reference tile depend on it). */
  referenceMode: "anchor" | "free";
  /** The secret strings a participant's payload must never contain. */
  secrets: string[];
};

type SamplePlan = {
  label: string;
  name?: string;
  reference?: "anchor" | "free";
  /** Per cupper: the level (1 to 9) every quality attribute is rated around; 0 = sent nothing. */
  levels: number[];
  /** Per cupper: the flavour-wheel nodes they picked. */
  picks: string[][];
  /** Per cupper: a defective first cup of this type. */
  defect?: (string | null)[];
};

type Plan = {
  id: string;
  title: { es: string; en: string };
  format: SessionFormat;
  isGroup: boolean;
  /** The page's `canViewGroup` for this viewer. */
  canViewGroup: boolean;
  /** The page's `ownerRead`. */
  ownerLens: boolean;
  cups: number;
  /** Index of the viewer among the cuppers. */
  viewer: number;
  /** Which of the viewer's evaluations are still drafts (by sample index). */
  viewerDrafts?: number[];
  cuppers: number;
  excluded?: number[];
  joined?: number;
  preliminary?: boolean;
  /** False for a cupping that is still open (default: closed). */
  closed?: boolean;
  myAlignment?: { matches: number; opportunities: number } | null;
  samples: SamplePlan[];
};

const FR = "fruity";
const BERRY = "fruity:berry";
const BLACKBERRY = "fruity:berry:blackberry";
const CITRUS = "fruity:citrus";
const FL = "floral";
const JASMINE = "floral:floral:jasmine";
const SW = "sweet";
const HONEY = "sweet:brown_sugar:honey";
const NUT = "nutty_cocoa";
const RO = "roasted";
const SP = "spice";
const GR = "green_veg";
const SO = "sour_fermented";
const OT = "other";

const clamp = (v: number) => Math.min(9, Math.max(1, v));

/** One cupper's module for one sample. `secret` rides in the free-text fields,
 *  as a real cupper's notes do. */
function moduleOf(plan: Plan, sample: SamplePlan, cupper: number): Record<string, unknown> | null {
  const level = sample.levels[cupper] ?? 0;
  if (level === 0) return null;
  const secret = `SECRETO-${plan.id}-${cupper}`;
  const data: Record<string, unknown> = {
    sabor_desc: sample.picks[cupper] ?? [],
    sabor_notas: `nota privada ${secret}`,
    cupperName: `Nombre ${secret}`,
  };
  if (plan.format !== "descriptive") {
    AFFECTIVE_ATTRIBUTES.forEach((attr, i) => {
      // anchor reference: everyone holds 5 on every attribute (the pin)
      data[`${attr.id}_final`] = sample.reference === "anchor" ? 5 : clamp(level + (((i + cupper) % 3) - 1));
    });
    const type = sample.defect?.[cupper] ?? null;
    if (type) {
      data.tazas_defectuosas = Array.from({ length: plan.cups }, (_, i) => i === 0);
      data.tazas_no_uniformes = Array.from({ length: plan.cups }, (_, i) => i === 0);
      data.tazas_defecto_tipo = Array.from({ length: plan.cups }, (_, i) => (i === 0 ? type : null));
    }
  }
  return data;
}

function build(plan: Plan): OverviewScenario {
  const excluded = new Set(plan.excluded ?? []);
  const cupperKey = (c: number) => `cupper-${plan.id}-${c}-key`;
  const rows: OverviewRow[] = [];
  const samples: FixtureSample[] = plan.samples.map((sp, s) => {
    const id = `${plan.id}-s${s}`;
    const modules = Array.from({ length: plan.cuppers }, (_, c) => moduleOf(plan, sp, c));
    const viewerDraft = (plan.viewerDrafts ?? []).includes(s);
    // what the page loads for the group: SENT evaluations only
    const sent = modules
      .map((data, c) => ({ data, c }))
      .filter((m): m is { data: Record<string, unknown>; c: number } => m.data !== null && !(m.c === plan.viewer && viewerDraft));
    for (const m of sent) {
      rows.push({ cupperKey: cupperKey(m.c), sampleId: id, excluded: excluded.has(m.c), data: m.data, cups: plan.cups });
    }
    const included = sent.filter((m) => !excluded.has(m.c));
    const agg =
      plan.format === "descriptive" || !(plan.isGroup && plan.canViewGroup)
        ? null
        : computeGroupAggregate(
            included.map((m) => ({
              data: m.data,
              defectiveCups: m.data.tazas_defectuosas as boolean[] | undefined,
              nonUniformCups: m.data.tazas_no_uniformes as boolean[] | undefined,
              cups: plan.cups,
            })),
            plan.cups,
          );
    const mine = modules[plan.viewer];
    const slot = (format: SessionFormat) => (plan.format === format && mine ? mine : {});
    return {
      id,
      label: sp.label,
      revealed: Boolean(sp.name),
      coffee: sp.name ? { name: sp.name } : null,
      descriptive: slot("descriptive"),
      affective: slot("affective"),
      combined: slot("combined"),
      aggregateScore: agg
        ? {
            communityScore: agg.communityScore,
            scoreSd: agg.scoreSd,
            participantCount: agg.included,
            submittedCount: agg.submitted,
            totalSubmitted: sent.length,
            totalCups: agg.totalCups,
            attrAverages: agg.attrAverages,
          }
        : null,
      myEvaluation: mine
        ? { status: viewerDraft ? "draft" : "submitted", complete: true }
        : { status: "none", complete: false },
      referenceRank: sp.reference ? 1 : null,
    };
  });

  const group = plan.isGroup && plan.canViewGroup;
  const sentCuppers = new Set(rows.map((r) => r.cupperKey)).size;
  const data = buildOverviewData({
    format: plan.format,
    cupsPerSample: plan.cups,
    isGroup: plan.isGroup,
    canViewGroup: plan.canViewGroup,
    ownerLens: plan.ownerLens,
    sampleIds: samples.map((s) => s.id),
    rows: group ? rows : null,
    own: Object.fromEntries(
      samples.map((s, i) => {
        const mine = moduleOf(plan, plan.samples[i], plan.viewer);
        const draft = (plan.viewerDrafts ?? []).includes(i);
        return [s.id, mine ? { data: mine, submitted: !draft, showRatings: true, cups: plan.cups } : null];
      }),
    ),
    joined: plan.joined ?? plan.cuppers,
    sentCuppers,
    excludedParticipants: excluded.size,
  });
  const reference = samples.find((s) => s.referenceRank !== null) ?? null;
  return {
    id: plan.id,
    title: plan.title,
    samples,
    ctx: { format: plan.format, isGroup: plan.isGroup, canViewGroup: plan.canViewGroup, cupsPerSample: plan.cups },
    referenceId: reference?.id ?? null,
    data,
    myAlignment: plan.myAlignment ?? null,
    preliminary: plan.preliminary ?? false,
    referencePinned: plan.samples.some((s) => s.reference === "anchor") && plan.format !== "descriptive",
    closed: plan.closed ?? true,
    referenceMode: plan.samples.some((s) => s.reference === "free") ? "free" : "anchor",
    secrets: [
      ...Array.from({ length: plan.cuppers }, (_, c) => cupperKey(c)),
      ...Array.from({ length: plan.cuppers }, (_, c) => `SECRETO-${plan.id}-${c}`),
    ],
  };
}

/** Seven cuppers, one excluded; an anchor reference; the first two coffees with
 *  no clear difference; one defective cup; a clear flavour and a flat one. */
const CLOSED: Plan = {
  id: "closed",
  title: { es: "Cata grupal cerrada, vista por un participante", en: "Closed group cupping, as a participant sees it" },
  format: "combined",
  isGroup: true,
  canViewGroup: true,
  ownerLens: false,
  cups: 2,
  viewer: 1,
  cuppers: 7,
  excluded: [6],
  joined: 8,
  myAlignment: { matches: 21, opportunities: 34 },
  samples: [
    { label: "Muestra E", name: "Referencia de la casa", reference: "anchor", levels: [5, 5, 5, 5, 5, 5, 5], picks: [[NUT], [NUT, RO], [NUT], [RO], [NUT, SW], [NUT], [RO]] },
    { label: "Muestra G", name: "Ámbar", levels: [8, 9, 8, 7, 8, 8, 9], picks: [[BLACKBERRY, JASMINE, HONEY], [BERRY, CITRUS, HONEY], [BLACKBERRY, JASMINE], [BERRY, HONEY, SO], [BLACKBERRY, CITRUS], [BERRY, FL, SW], [FR]] },
    { label: "Muestra C", name: "Granate", levels: [8, 8, 8, 8, 7, 8, 8], picks: [[FR, SP], [BERRY, NUT], [FR, SW], [NUT, SP], [FR, RO], [SW, NUT], [FR]] },
    { label: "Muestra A", name: "Niebla", levels: [7, 6, 7, 7, 6, 7, 7], picks: [[FL], [FR], [GR], [NUT], [SW], [SO], [OT]] },
    { label: "Muestra B", name: "Musgo", levels: [6, 6, 5, 6, 6, 5, 6], picks: [[GR, RO], [GR, RO, OT], [RO, NUT], [GR, OT], [GR, RO], [RO, SO], [GR]] },
    { label: "Muestra D", name: "Cedro", levels: [4, 5, 4, 4, 5, 4, 4], picks: [[RO, OT], [RO], [OT, GR], [RO, OT], [RO], [OT], [RO]], defect: [null, null, "phenolic", "phenolic", null, null, null] },
  ],
};

/** The same cupping as its organizer sees it: the exclusion is counted. */
const CLOSED_OWNER: Plan = {
  ...CLOSED,
  id: "closed-owner",
  title: { es: "La misma cata, vista por quien la organizó", en: "The same cupping, as its organizer sees it" },
  ownerLens: true,
  viewer: 0,
};

/** Two cuppers: a valid panel, but no "first", no spread, no wheel for a participant. */
const TWO: Plan = {
  id: "two",
  title: { es: "Dos catadores, vista por un participante", en: "Two cuppers, as a participant sees it" },
  format: "combined",
  isGroup: true,
  canViewGroup: true,
  ownerLens: false,
  cups: 2,
  viewer: 0,
  cuppers: 2,
  samples: [
    { label: "Muestra A", levels: [8, 7], picks: [[FR, FL], [FR]] },
    { label: "Muestra B", levels: [6, 7], picks: [[NUT], [RO, NUT]] },
    { label: "Muestra C", levels: [5, 5], picks: [[GR], [OT]] },
  ],
};

/** A free reference: everyone scored it like any other coffee. */
const FREE: Plan = {
  id: "free",
  title: { es: "Referencia libre, cinco catadores", en: "Free reference, five cuppers" },
  format: "affective",
  isGroup: true,
  canViewGroup: true,
  ownerLens: false,
  cups: 1,
  viewer: 2,
  cuppers: 5,
  samples: [
    { label: "Muestra R", name: "Control", reference: "free", levels: [6, 7, 6, 6, 7], picks: [[], [], [], [], []] },
    { label: "Muestra A", name: "Brisa", levels: [8, 8, 7, 8, 9], picks: [[], [], [], [], []] },
    { label: "Muestra B", name: "Arcilla", levels: [5, 6, 6, 5, 5], picks: [[], [], [], [], []] },
  ],
};

/** An open group cupping, as a participant sees it: own scores only, in cupping
 *  order; a complete draft has no total. */
const OPEN: Plan = {
  id: "open",
  title: { es: "Cata grupal abierta, vista por un participante", en: "Open group cupping, as a participant sees it" },
  format: "combined",
  isGroup: true,
  canViewGroup: false,
  ownerLens: false,
  cups: 2,
  viewer: 0,
  viewerDrafts: [2],
  closed: false,
  cuppers: 4,
  samples: [
    { label: "Muestra A", levels: [7, 8, 7, 7], picks: [[FR, FL], [FR], [FL], [FR]] },
    { label: "Muestra B", levels: [8, 6, 6, 7], picks: [[NUT, SW], [RO], [NUT], [RO]] },
    { label: "Muestra C", levels: [5, 5, 6, 5], picks: [[GR], [OT], [GR], [GR]] },
    { label: "Muestra D", levels: [0, 6, 6, 6], picks: [[], [SP], [SP], [RO]] },
  ],
};

/** A solo cupping: the cupper's own ranking and marks. */
const SOLO: Plan = {
  id: "solo",
  title: { es: "Cata individual cerrada", en: "Closed solo cupping" },
  format: "combined",
  isGroup: false,
  canViewGroup: false,
  ownerLens: true,
  cups: 1,
  viewer: 0,
  cuppers: 1,
  samples: [
    { label: "Muestra A", name: "Ámbar", levels: [8], picks: [[BLACKBERRY, HONEY, JASMINE]] },
    { label: "Muestra B", name: "Musgo", levels: [6], picks: [[GR, RO]] },
    { label: "Muestra C", name: "Cedro", levels: [4], picks: [[RO, OT]], defect: ["moldy"] },
  ],
};

/** A descriptive session: no scores, the wheels lead. */
const DESCRIPTIVE: Plan = {
  ...CLOSED,
  id: "descriptive",
  title: { es: "Cata descriptiva cerrada", en: "Closed descriptive cupping" },
  format: "descriptive",
  myAlignment: null,
};

export const OVERVIEW_SCENARIOS: OverviewScenario[] = [CLOSED, CLOSED_OWNER, TWO, FREE, OPEN, SOLO, DESCRIPTIVE].map(build);

export const overviewScenario = (id: string): OverviewScenario => {
  const found = OVERVIEW_SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`no overview scenario "${id}"`);
  return found;
};
