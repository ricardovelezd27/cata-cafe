// "Aprendizajes": the fourteen learnings of a closed cupping, as data (package
// R4a of docs/audits/app-ui-ux-2026-11-15/RESULTS-DESIGN.md, section 7).
// Pure, like lib/reports/personalComparison.ts and lib/reports/wheelData.ts: no
// Prisma, no React, no i18n. Computed at read time; nothing is stored.
//
// Each learning is `{ rule, about, params }`: the rule's id, the sample ids it
// is about (the page's own ids, passed through), and the numbers its sentence
// needs. NO TEXT: the Spanish and English sentences are package R4b's. A rule
// whose threshold is not met is simply absent.
//
// What holds for all fourteen:
//   - a score is a number only: no rule names or ranks a coffee by quality;
//   - the data is neutral ("furthest from the group", a signed difference):
//     nothing is an error and nobody is graded;
//   - a reference is never the subject of a sentence about the panel, in either
//     mode; it is only what G4 and S2 compare against;
//   - an excluded cupper feeds nothing (the group numbers passed in already
//     leave them out, and `buildDefectSummary` drops them itself);
//   - no learning carries a cupper's name, id or individual value other than
//     the viewer's own.
//
// GATES, here so that no caller can forget them:
//   - nothing at all unless `closed` (teaching appears only after the close);
//   - a sentence about the panel (G*) needs a group session, `groupVisible`, and
//     `panelGates(n).panelLearnings` on every sample it uses;
//   - a sentence that puts the viewer beside the group (P1 to P5) needs
//     `groupVisible` and `panelGates(n).difference` on the samples it uses;
//   - anything read from the wheel needs a `WheelData` of status "ok" and, for a
//     participant, `panelGates(n).flavorWheel`;
//   - a solo session gets S1, S2 and P6 only.
// This file decides nothing about who may see group results or whether a
// session is closed: both are booleans it is given.
// Display-only: scoring, the trigger and AggregateScore never read this file.

import { SENSORY_DEFECTS, type SensoryDefect } from "@/lib/constants";
import { defectTally } from "@/lib/cupDefects";
import { countedDescriptors } from "@/lib/flavorWheel";
import type { RankValue } from "@/lib/reports/ranking";
import { REPEAT_TOLERANCE } from "@/lib/reports/repeatedSample";
import { formatHasWheel, type WheelData } from "@/lib/reports/wheelData";
import { round2, tiesWithNext } from "@/lib/resultsScales";
import { isAffectiveComplete } from "@/lib/scoring";
import { panelGates } from "@/lib/scoreContext";

// ── The thresholds, in one table ─────────────────────────────────────────────
// Every value is SIMULATED and WAITS ON KIM (RESULTS-DESIGN section 12). None
// has a code in docs/product/kim-validar-S10.md yet.

export const LEARNING_THRESHOLDS = {
  /** G0: a descriptor is "most shared" from this many cuppers... (waits on Kim) */
  mostSharedMinPeople: 3,
  /** G0: ...who are at least this share of the cuppers of that sample. (waits on Kim) */
  mostSharedMinShare: 0.5,
  /** G1, G2: the largest and the smallest spread must differ by this much. (waits on Kim) */
  spreadMinRange: 0.5,
  /** P1: "furthest from the group" needs a distance of this many points. (waits on Kim) */
  furthestMinPoints: 1,
  /** P4: an attribute is named from this mean difference, on the 1 to 9 scale. (waits on Kim) */
  attributeMinMeanDifference: 0.5,
  /** P5: the alignment sentence needs this many majority descriptors. (waits on Kim) */
  alignmentMinOpportunities: 5,
} as const;

/** How many learnings are shown: about the panel, and of the viewer's own. (waits on Kim) */
export const LEARNING_CAPS = { panel: 4, mine: 5 } as const;

// Thresholds that already exist and are only READ here:
//   G3  the tie rule, RANKING_POLICY (TODO(kim-validar:D3)), through `tiesWithNext`;
//   P6  REPEAT_TOLERANCE, 2 points (TODO(kim-validar:B6));
//   the gates, `panelGates` (three included cuppers).

/** The fourteen rules, in the order they are shown. */
export const LEARNING_RULES = [
  "G0", "G1", "G2", "G3", "G4", "G5",
  "P1", "P2", "P3", "P4", "P5", "P6",
  "S1", "S2",
] as const;
export type LearningRule = (typeof LEARNING_RULES)[number];

/** `panel`: about the cupping as a whole, the same for everyone who may see the
 *  group's results. `mine`: built from the viewer's own values, for their page only. */
export function learningScope(rule: LearningRule): "panel" | "mine" {
  return rule.startsWith("G") ? "panel" : "mine";
}

// ── The defects of one sample (what G5 reads) ────────────────────────────────

/** One evaluation of the sample, as the page already has it. No cupper key:
 *  each row is one cupper (an evaluation is unique per sample and cupper). */
export type DefectEvaluation = {
  excluded: boolean;
  submitted: boolean;
  /** The format's module JSON. */
  data: unknown;
  /** `Evaluation.cups`; null = stored before 2026-11 (the session's cups apply). */
  cups: number | null;
};

export type DefectSummary = {
  /** Included evaluations: sent, not excluded, complete. The "n" of the score. */
  n: number;
  /** How many of them flagged at least one defective cup. */
  cuppers: number;
  /** Defective cups over all of them. */
  cups: number;
  /** Cups by type, most cups first; `null` = no type recorded. Zeros left out. */
  types: { type: SensoryDefect | null; cups: number }[];
};

/**
 * Who flagged a defective cup on ONE sample, among the evaluations the group's
 * score pools (sent, not excluded, complete: `isAffectiveComplete`). It reads
 * the cups through `defectTally`, the one reader of "which cups were defective
 * and of which type". A descriptive session has no cups: null.
 */
export function buildDefectSummary(input: {
  format: string;
  cupsPerSample: number;
  evaluations: readonly DefectEvaluation[];
}): DefectSummary | null {
  if (input.format !== "affective" && input.format !== "combined") return null;
  const byType = new Map<SensoryDefect | null, number>();
  let n = 0;
  let cuppers = 0;
  let cups = 0;
  for (const ev of input.evaluations) {
    if (ev.submitted !== true || ev.excluded !== false) continue;
    if (typeof ev.data !== "object" || ev.data === null || Array.isArray(ev.data)) continue;
    const data = ev.data as Record<string, unknown>;
    if (!isAffectiveComplete(data)) continue;
    n += 1;
    const own = typeof ev.cups === "number" && Number.isFinite(ev.cups) ? ev.cups : input.cupsPerSample;
    const tally = defectTally(data, Math.max(0, Math.floor(own)));
    if (tally.total === 0) continue;
    cuppers += 1;
    cups += tally.total;
    for (const type of SENSORY_DEFECTS) {
      if (tally.byType[type] > 0) byType.set(type, (byType.get(type) ?? 0) + tally.byType[type]);
    }
    if (tally.unspecified > 0) byType.set(null, (byType.get(null) ?? 0) + tally.unspecified);
  }
  // Most cups first; equal counts in the order of SENSORY_DEFECTS, "no type" last.
  const order: (SensoryDefect | null)[] = [...SENSORY_DEFECTS, null];
  const types = order
    .filter((type) => (byType.get(type) ?? 0) > 0)
    .map((type) => ({ type, cups: byType.get(type) as number }))
    .sort((a, b) => b.cups - a.cups);
  return { n, cuppers, cups, types };
}

// ── The input: only what the results page already has ────────────────────────

export type LearningSample = {
  /** The page's own sample id; passed through in `about`. */
  id: string;
  /** Any reference (anchor): outside the ranking, never the subject of a panel sentence. */
  isReference: boolean;
  /** An anchor-mode reference of an affective or combined session: its score is
   *  fixed by rule (79.00), not an average, so it needs no minimum of cuppers. */
  pinned?: boolean;
  /** The score the page displays for the sample (`rankFor` / a `RankedEntry`). */
  value: RankValue;
  /** The viewer's own score for the sample; null when they have none to show. */
  mine: number | null;
  /** Δ against the active reference, as the page's chips show it (`refDeltas`). */
  deltaVsReference: number | null;
  /** The viewer's value and the group's per quality attribute: the `affective.attrs`
   *  rows of `buildPersonalComparison` when its status is "ok". A row's `group`
   *  is already null when fewer than three cuppers rated it. */
  attributes?: readonly { id: string; mine: number | null; group: number | null }[] | null;
  /** The sample's wheel (lib/reports/wheelData.ts), with its status. */
  wheel?: WheelData | null;
  /** `buildDefectSummary` for the sample. */
  defects?: DefectSummary | null;
};

export type LearningsInput = {
  /** The session is closed. Teaching appears only after the close: false = no learning. */
  closed: boolean;
  isGroup: boolean;
  /** The caller's `viewerMayReadGroupResults`: the viewer may see group results. */
  groupVisible: boolean;
  /** The organizer's lens (the page's `ownerRead`): not restricted by the wheel's gate. */
  ownerLens: boolean;
  format: string;
  /** Every sample of the session, in the page's order. */
  samples: readonly LearningSample[];
  /** The ACTIVE reference (the one the Δ chips compare against), or null. */
  referenceId: string | null;
  /** The viewer's own alignment triple (`myAlignment` of the page) and the number
   *  of included cuppers it was computed over; null when they have none. */
  alignment?: { matches: number; opportunities: number; cuppers: number } | null;
  /** The viewer's own two total scores for each pair of samples that were the
   *  same coffee (`repeatedSamplePartners` + `compareOwnEvaluations(...).total`). */
  repeats?: readonly { a: string; b: string; scoreA: number; scoreB: number }[] | null;
};

// ── The output ───────────────────────────────────────────────────────────────

export type Learning =
  /** G0. Most shared in this cupping: a descriptor (a wheel node id) on one sample. */
  | { rule: "G0"; about: string[]; params: { descriptor: string; people: number; of: number } }
  /** G1. The panel agreed most on this sample: its spread is the smallest. */
  | { rule: "G1"; about: string[]; params: { spread: number; included: number; submitted: number | null } }
  /** G2. Scores were furthest apart on this sample: its spread is the largest. */
  | { rule: "G2"; about: string[]; params: { spread: number; included: number; submitted: number | null } }
  /** G3. The first and the second of the ranking have no clear difference. about = [first, second]. */
  | { rule: "G3"; about: string[]; params: { gap: number } }
  /** G4. Against the reference: how many samples scored above it, and the furthest.
   *  about = [reference, furthest]. */
  | { rule: "G4"; about: string[]; params: { referenceScore: number; above: number; of: number; delta: number } }
  /** G5. On this sample, `people` of `of` cuppers flagged a defective cup. */
  | { rule: "G5"; about: string[]; params: { people: number; of: number; cups: number; types: { type: SensoryDefect | null; cups: number }[] } }
  /** P1. The viewer's score furthest from the group's. */
  | { rule: "P1"; about: string[]; params: { mine: number; group: number; difference: number } }
  /** P2. The viewer's score closest to the group's (another sample than P1's). */
  | { rule: "P2"; about: string[]; params: { mine: number; group: number; difference: number } }
  /** P3. In how many samples the viewer scored above the group, and the mean difference. */
  | { rule: "P3"; about: string[]; params: { above: number; of: number; meanDifference: number } }
  /** P4. The quality attribute where the viewer's mean difference from the group is largest. */
  | { rule: "P4"; about: string[]; params: { attribute: string; meanDifference: number; samples: number } }
  /** P5. Of the descriptors most of the panel chose, how many the viewer chose. */
  | { rule: "P5"; about: string[]; params: { matches: number; opportunities: number; percent: number } }
  /** P6. Two samples were the same coffee: the viewer's two scores. about = [a, b]. */
  | { rule: "P6"; about: string[]; params: { scoreA: number; scoreB: number; difference: number; within: boolean; tolerance: number } }
  /** S1. Solo: the highest and the lowest score. about = [highest, lowest]. */
  | { rule: "S1"; about: string[]; params: { highest: number; lowest: number; range: number } }
  /** S2. Solo, with a reference: how many samples scored above it. about = [reference]. */
  | { rule: "S2"; about: string[]; params: { referenceScore: number; above: number; of: number } };

// ── The rules ────────────────────────────────────────────────────────────────

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Samples outside the references, highest displayed score first; equal scores
 *  and unscored samples keep the page's order (as `rankSamples` sorts them). */
function rankingOf(samples: readonly LearningSample[]): LearningSample[] {
  return samples
    .filter((s) => !s.isReference)
    .map((sample, order) => ({ sample, order }))
    .sort((a, b) => {
      const x = a.sample.value.score;
      const y = b.sample.value.score;
      if (x === null && y === null) return a.order - b.order;
      if (x === null) return 1;
      if (y === null) return -1;
      return y - x || a.order - b.order;
    })
    .map((r) => r.sample);
}

/** A community score that may be used in a sentence: three included cuppers. */
function panelScoreOf(s: LearningSample, gate: "panelLearnings" | "difference"): number | null {
  const v = s.value;
  if (v.basis !== "community" || !num(v.score) || !num(v.n)) return null;
  return panelGates(v.n)[gate] ? v.score : null;
}

/** The first of the largest (sign +1) or the smallest (sign -1) by `key`. */
function extreme<T>(list: readonly T[], key: (item: T) => number, sign: 1 | -1): T {
  return list.reduce((best, item) => (sign * (key(item) - key(best)) > 0 ? item : best));
}

function panelLearnings(input: LearningsInput, ranking: LearningSample[]): Learning[] {
  const out: Learning[] = [];
  const T = LEARNING_THRESHOLDS;

  // G0: the descriptor with the most cuppers on any one sample.
  if (formatHasWheel(input.format)) {
    let best: { id: string; descriptor: string; people: number; of: number } | null = null;
    for (const s of ranking) {
      const w = s.wheel;
      if (!w || w.status !== "ok" || w.scope !== "group") continue;
      const gates = panelGates(w.n);
      if (!gates.panelLearnings || (!input.ownerLens && !gates.flavorWheel)) continue;
      const top = countedDescriptors(w.direct, w.n, 1)[0];
      if (!top || top.bar.count < T.mostSharedMinPeople || top.bar.share < T.mostSharedMinShare) continue;
      const better =
        best === null ||
        top.bar.count > best.people ||
        (top.bar.count === best.people && top.bar.share > best.people / best.of);
      if (better) best = { id: s.id, descriptor: top.id, people: top.bar.count, of: top.bar.n };
    }
    if (best) {
      out.push({ rule: "G0", about: [best.id], params: { descriptor: best.descriptor, people: best.people, of: best.of } });
    }
  }

  // G1, G2: the smallest and the largest spread, when they are far enough apart.
  const spreads = ranking.filter((s) => panelScoreOf(s, "panelLearnings") !== null && num(s.value.sd));
  if (spreads.length >= 2) {
    const sd = (s: LearningSample) => s.value.sd as number;
    const lo = extreme(spreads, sd, -1);
    const hi = extreme(spreads, sd, 1);
    if (round2(sd(hi) - sd(lo)) >= T.spreadMinRange) {
      const params = (s: LearningSample) => ({ spread: sd(s), included: s.value.n as number, submitted: s.value.total });
      out.push({ rule: "G1", about: [lo.id], params: params(lo) });
      out.push({ rule: "G2", about: [hi.id], params: params(hi) });
    }
  }

  // G3: the first and the second of the ranking have no clear difference.
  const [first, second] = ranking;
  if (first && second) {
    const a = panelScoreOf(first, "panelLearnings");
    const b = panelScoreOf(second, "panelLearnings");
    if (a !== null && b !== null && tiesWithNext([first.value, second.value])[0]) {
      out.push({ rule: "G3", about: [first.id, second.id], params: { gap: round2(a - b) } });
    }
  }

  // G4: against the reference.
  const reference = input.referenceId === null ? null : (input.samples.find((s) => s.id === input.referenceId) ?? null);
  if (reference && reference.isReference && reference.value.basis === "community" && num(reference.value.score)) {
    const usable = reference.pinned === true || (num(reference.value.n) && panelGates(reference.value.n).panelLearnings);
    const compared = ranking.filter((s) => panelScoreOf(s, "panelLearnings") !== null && num(s.deltaVsReference));
    if (usable && compared.length > 0) {
      const delta = (s: LearningSample) => s.deltaVsReference as number;
      const furthest = extreme(compared, (s) => Math.abs(delta(s)), 1);
      out.push({
        rule: "G4",
        about: [reference.id, furthest.id],
        params: {
          referenceScore: reference.value.score,
          above: compared.filter((s) => delta(s) > 0).length,
          of: compared.length,
          delta: round2(delta(furthest)),
        },
      });
    }
  }

  // G5: the sample where most cuppers flagged a defective cup.
  let flagged: LearningSample | null = null;
  for (const s of ranking) {
    const d = s.defects;
    if (!d || d.cuppers <= 0 || !panelGates(d.n).panelLearnings) continue;
    const cur = flagged?.defects;
    if (!cur || d.cuppers > cur.cuppers || (d.cuppers === cur.cuppers && d.cups > cur.cups)) flagged = s;
  }
  if (flagged?.defects) {
    const d = flagged.defects;
    out.push({
      rule: "G5",
      about: [flagged.id],
      params: { people: d.cuppers, of: d.n, cups: d.cups, types: d.types.map((t) => ({ type: t.type, cups: t.cups })) },
    });
  }

  return out;
}

/** P1 to P5: the viewer beside the group. */
function besideTheGroup(input: LearningsInput, ranking: LearningSample[]): Learning[] {
  const out: Learning[] = [];
  const T = LEARNING_THRESHOLDS;
  const rows = ranking
    .map((s) => ({ s, group: panelScoreOf(s, "difference") }))
    .filter((r): r is { s: LearningSample; group: number } => r.group !== null && num(r.s.mine))
    .map((r) => ({ s: r.s, mine: r.s.mine as number, group: r.group, d: round2((r.s.mine as number) - r.group) }));

  if (rows.length > 0) {
    const far = extreme(rows, (r) => Math.abs(r.d), 1);
    const near = extreme(rows, (r) => Math.abs(r.d), -1);
    const params = (r: (typeof rows)[number]) => ({ mine: r.mine, group: r.group, difference: r.d });
    if (Math.abs(far.d) >= T.furthestMinPoints) out.push({ rule: "P1", about: [far.s.id], params: params(far) });
    if (near.s.id !== far.s.id) out.push({ rule: "P2", about: [near.s.id], params: params(near) });
    out.push({
      rule: "P3",
      about: rows.map((r) => r.s.id),
      params: {
        above: rows.filter((r) => r.d > 0).length,
        of: rows.length,
        meanDifference: round2(rows.reduce((sum, r) => sum + r.d, 0) / rows.length),
      },
    });

    // P4: per quality attribute, the mean of (mine - group) over the samples where both exist.
    const byAttribute = new Map<string, number[]>();
    for (const r of rows) {
      for (const a of r.s.attributes ?? []) {
        if (!num(a.mine) || !num(a.group)) continue;
        const list = byAttribute.get(a.id);
        if (list) list.push(a.mine - a.group);
        else byAttribute.set(a.id, [a.mine - a.group]);
      }
    }
    const means = [...byAttribute].map(([attribute, diffs]) => ({
      attribute,
      samples: diffs.length,
      meanDifference: round2(diffs.reduce((x, y) => x + y, 0) / diffs.length),
    }));
    if (means.length > 0) {
      const top = extreme(means, (m) => Math.abs(m.meanDifference), 1);
      if (Math.abs(top.meanDifference) >= T.attributeMinMeanDifference) {
        out.push({ rule: "P4", about: [], params: top });
      }
    }
  }

  // P5: the viewer's own alignment row.
  const al = input.alignment;
  if (al && formatHasWheel(input.format) && num(al.matches) && num(al.opportunities) && num(al.cuppers)) {
    const gates = panelGates(al.cuppers);
    const open = gates.sharedDescriptors && (input.ownerLens || gates.flavorWheel);
    if (open && al.opportunities >= T.alignmentMinOpportunities) {
      out.push({
        rule: "P5",
        about: [],
        params: {
          matches: al.matches,
          opportunities: al.opportunities,
          percent: Math.round((al.matches / al.opportunities) * 100),
        },
      });
    }
  }
  return out;
}

/** P6: the viewer's own two scores for the same coffee. One learning per pair. */
function repeated(input: LearningsInput): Learning[] {
  const out: Learning[] = [];
  const seen = new Set<string>();
  for (const pair of input.repeats ?? []) {
    if (!num(pair.scoreA) || !num(pair.scoreB) || pair.a === pair.b) continue;
    const key = [pair.a, pair.b].sort().join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    const difference = round2(Math.abs(pair.scoreA - pair.scoreB));
    out.push({
      rule: "P6",
      about: [pair.a, pair.b],
      params: {
        scoreA: pair.scoreA,
        scoreB: pair.scoreB,
        difference,
        within: difference <= REPEAT_TOLERANCE,
        tolerance: REPEAT_TOLERANCE,
      },
    });
  }
  return out;
}

/** S1, S2: a solo cupper's own scores. */
function solo(input: LearningsInput, ranking: LearningSample[]): Learning[] {
  const out: Learning[] = [];
  const scored = ranking.filter((s) => s.value.basis === "mine" && num(s.value.score));
  if (scored.length >= 2) {
    const hi = scored[0];
    const lo = scored[scored.length - 1];
    const highest = hi.value.score as number;
    const lowest = lo.value.score as number;
    out.push({ rule: "S1", about: [hi.id, lo.id], params: { highest, lowest, range: round2(highest - lowest) } });
  }
  const reference = input.referenceId === null ? null : (input.samples.find((s) => s.id === input.referenceId) ?? null);
  if (reference && reference.isReference && reference.value.basis === "mine" && num(reference.value.score)) {
    const compared = scored.filter((s) => num(s.deltaVsReference));
    if (compared.length > 0) {
      out.push({
        rule: "S2",
        about: [reference.id],
        params: {
          referenceScore: reference.value.score,
          above: compared.filter((s) => (s.deltaVsReference as number) > 0).length,
          of: compared.length,
        },
      });
    }
  }
  return out;
}

/**
 * The learnings of a cupping for ONE viewer, in the order they are shown: up to
 * four about the panel (G0 to G5), then up to five of the viewer's own (P1 to
 * P6, S1, S2). Empty while the session is not closed.
 */
export function buildLearnings(input: LearningsInput): Learning[] {
  if (input.closed !== true) return [];
  const ranking = rankingOf(input.samples);
  const group = input.isGroup === true && input.groupVisible === true;

  const panel = group ? panelLearnings(input, ranking) : [];
  const mine: Learning[] = [];
  if (group) mine.push(...besideTheGroup(input, ranking));
  mine.push(...repeated(input));
  if (input.isGroup !== true) mine.push(...solo(input, ranking));

  return [...panel.slice(0, LEARNING_CAPS.panel), ...mine.slice(0, LEARNING_CAPS.mine)];
}

/**
 * Why the panel's list is what it is, so the page can say "con menos de 3
 * catadores incluidos no se calculan frases sobre el panel" instead of showing
 * an empty column: `not_applicable` (not closed, a solo session, or group
 * results not visible), `too_few` (no sample has three included cuppers), `ok`.
 */
export function panelLearningsStatus(input: LearningsInput): "not_applicable" | "too_few" | "ok" {
  if (input.closed !== true || input.isGroup !== true || input.groupVisible !== true) return "not_applicable";
  const enough = input.samples.some((s) => {
    if (s.isReference) return false;
    const counts = [
      s.value.basis === "community" ? s.value.n : null,
      s.wheel && s.wheel.status === "ok" && s.wheel.scope === "group" ? s.wheel.n : null,
      s.defects ? s.defects.n : null,
    ];
    return counts.some((n) => num(n) && panelGates(n).panelLearnings);
  });
  return enough ? "ok" : "too_few";
}
