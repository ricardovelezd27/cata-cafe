// Pure builder for the "Ficha tecnica" report.
//
// Two tiers:
//  - "owner":       full sheet incl. the green-bean block and the owner
//                   appendix (cupper x sample CVA matrix + alignment ranking).
//  - "participant": the same per-sample sheet WITHOUT the green block and
//                   WITHOUT any appendix (no per-cupper identity at all).
// Identity of the coffee and its origin data follow the reveal gate for
// participants; the owner always sees them.

import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { DESCRIPTOR_STAGES } from "@/lib/descriptors";
import { calcIndividualScore, hasAffectiveData } from "@/lib/scoring";
import { coffeeDisplayName } from "@/lib/coffeeAnonymize";
import { bandFor, rowStats, type Band, type RowStats } from "./cupperStats";
import { consensusLine } from "./ranking";
import {
  blobForFormat,
  type ReportCoffee,
  type ReportLabels,
  type ReportLocale,
  type SessionReportSource,
} from "./types";

export type FichaTier = "owner" | "participant";

export type FichaOptions = {
  tier: FichaTier;
  locale: ReportLocale;
  labels: ReportLabels;
};

export type FichaIdentity = {
  label: string;
  isReference: boolean;
  revealed: boolean;
  /** Null while blind (participant tier). */
  coffeeName: string | null;
  code: string | null;
  roastLevel: string | null;
  coffee: Pick<
    ReportCoffee,
    "country" | "region" | "farm" | "producer" | "variety" | "processType" | "altitude"
  > | null;
};

export type FichaAffective = {
  communityScore: number | null;
  sd: number | null;
  included: number;
  submitted: number;
  /** AFFECTIVE_ATTRIBUTES order; value null when no data. */
  attrAverages: { id: string; label: string; value: number | null }[];
  uniformityPenalty: number;
  defectPenalty: number;
};

export type FichaDescriptiveBlock = {
  blockId: string;
  label: string;
  descriptors: { id: string; label: string; count: number; pct: number }[];
  consensus: string | null;
};

export type FichaDescriptive = {
  totalEvaluators: number;
  blocks: FichaDescriptiveBlock[];
  consensus: string | null;
  /** Mean of each `<stage>_int` slider across included cuppers (0 → ignored). */
  intensityMeans: { stage: string; mean: number | null }[];
};

export type FichaSample = {
  identity: FichaIdentity;
  /** Raw origin data; empty when not allowed to be shown. */
  extrinsic: Record<string, unknown>;
  /** OWNER TIER ONLY — the key is absent in the participant tier. */
  green?: Record<string, unknown>;
  affective: FichaAffective | null;
  descriptive: FichaDescriptive | null;
  participation: { submitted: number; included: number; total: number };
};

export type FichaOwnerAppendix = {
  samples: { id: string; label: string }[];
  cuppers: {
    id: string;
    name: string;
    excluded: boolean;
    /** Aligned with `samples`. */
    scores: (number | null)[];
    bands: Band[];
  }[];
  rowStats: RowStats[];
  alignment: { id: string; name: string; excluded: boolean; alignment: number }[];
};

export type FichaTecnicaModel = {
  tier: FichaTier;
  header: {
    sessionName: string;
    date: Date;
    format: string;
    cupsPerSample: number;
    objective: string | null;
    isGroup: boolean;
    participants: number;
  };
  samples: FichaSample[];
  /** Present ONLY for tier "owner". */
  ownerAppendix?: FichaOwnerAppendix;
};

const BLOCK_ORDER = ["nariz", "boca", "gusto", "acidez", "dulzura", "sensacion"];

export function buildFichaTecnica(
  src: SessionReportSource,
  opts: FichaOptions,
): FichaTecnicaModel {
  const { session } = src;
  const format = session.format;
  const owner = opts.tier === "owner";
  const excluded = new Set(src.excludedUserIds);
  const freqById = new Map((src.descriptorFrequency ?? []).map((f) => [f.sampleId, f]));
  const totalParticipants = src.participants.length;

  const samples: FichaSample[] = src.samples.map((s) => {
    const showCoffee = owner || s.revealed;
    const coffee = showCoffee ? s.coffee : null;
    const identity: FichaIdentity = {
      label: s.label,
      isReference: s.isReference,
      revealed: s.revealed,
      coffeeName: coffee ? coffeeDisplayName(coffee, opts.labels.coffeeDeleted) : null,
      code: coffee && !coffee.deletedAt ? coffee.code : null,
      roastLevel: coffee && !coffee.deletedAt ? coffee.roastLevel : null,
      coffee:
        coffee && !coffee.deletedAt
          ? {
              country: coffee.country,
              region: coffee.region,
              farm: coffee.farm,
              producer: coffee.producer,
              variety: coffee.variety,
              processType: coffee.processType,
              altitude: coffee.altitude,
            }
          : null,
    };

    const agg = src.groupAggBySample[s.id];
    const sampleEvals = src.evals.filter((e) => e.sessionSampleId === s.id);
    const includedEvals = sampleEvals.filter((e) => !excluded.has(e.cupperId));

    let affective: FichaAffective | null = null;
    if (format !== "descriptive") {
      affective = {
        communityScore: agg?.communityScore ?? null,
        sd: agg?.scoreSd ?? null,
        included: agg?.included ?? 0,
        submitted: agg?.submitted ?? 0,
        attrAverages: AFFECTIVE_ATTRIBUTES.map((a) => ({
          id: a.id,
          label: a.label,
          value: agg && agg.included > 0 ? (agg.attrAverages[a.label] ?? null) : null,
        })),
        uniformityPenalty:
          agg && agg.totalCups > 0 ? agg.totalNonUniform * (10 / agg.totalCups) : 0,
        defectPenalty: agg && agg.totalCups > 0 ? agg.totalDefective * (30 / agg.totalCups) : 0,
      };
    }

    let descriptive: FichaDescriptive | null = null;
    const freq = freqById.get(s.id);
    if (format !== "affective" && freq) {
      const total = freq.totalEvaluators;
      const blocks = BLOCK_ORDER.filter((id) => freq.blocks[id]).map((blockId) => ({
        blockId,
        label: blockId,
        descriptors: (freq.blocks[blockId] ?? []).map((d) => ({
          id: d.id,
          label: d.label,
          count: d.count,
          pct: total > 0 ? Math.round((d.count / total) * 100) : 0,
        })),
        consensus: freq.summary[blockId] ?? null,
      }));
      const intensityMeans = DESCRIPTOR_STAGES.map((stage) => {
        const vals = includedEvals
          .map((e) => Number(blobForFormat(format, e)[`${stage.id}_int`] ?? 0))
          .filter((n) => Number.isFinite(n) && n > 0);
        return {
          stage: stage.id,
          mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
        };
      });
      descriptive = {
        totalEvaluators: total,
        blocks,
        consensus: consensusLine(freq, !session.isGroup, opts.labels),
        intensityMeans,
      };
    }

    const sample: FichaSample = {
      identity,
      extrinsic: owner || s.revealed ? s.extrinsic : {},
      affective,
      descriptive,
      participation: {
        submitted: sampleEvals.length,
        included: includedEvals.length,
        total: totalParticipants,
      },
    };
    if (owner) sample.green = s.physical;
    return sample;
  });

  const model: FichaTecnicaModel = {
    tier: opts.tier,
    header: {
      sessionName: session.name,
      date: session.date,
      format,
      cupsPerSample: session.cupsPerSample,
      objective: session.objective,
      isGroup: session.isGroup,
      participants: totalParticipants,
    },
    samples,
  };

  if (owner) {
    const cuppers = new Map<string, { name: string }>();
    for (const e of src.evals) cuppers.set(e.cupperId, { name: e.displayName });
    const cupperIds = [...cuppers.keys()].sort((a, b) =>
      cuppers.get(a)!.name.localeCompare(cuppers.get(b)!.name, opts.locale),
    );
    const scoreFor = (cupperId: string, sampleId: string): number | null => {
      if (format === "descriptive") return null;
      const ev = src.evals.find((e) => e.cupperId === cupperId && e.sessionSampleId === sampleId);
      if (!ev) return null;
      const blob = blobForFormat(format, ev);
      if (!hasAffectiveData(blob)) return null;
      const sc = calcIndividualScore(blob, session.cupsPerSample);
      return typeof sc === "number" ? sc : null;
    };
    const matrix = src.samples.map((s) => cupperIds.map((id) => scoreFor(id, s.id)));
    const included = cupperIds.map((id) => !excluded.has(id));
    const stats = matrix.map((row) => rowStats(row, included));
    model.ownerAppendix = {
      samples: src.samples.map((s) => ({ id: s.id, label: s.label })),
      cuppers: cupperIds.map((id, ci) => ({
        id,
        name: cuppers.get(id)!.name,
        excluded: excluded.has(id),
        scores: matrix.map((row) => row[ci]),
        bands: matrix.map((row, si) => (excluded.has(id) ? "neutral" : bandFor(row[ci], stats[si]))),
      })),
      rowStats: stats,
      alignment: src.alignmentRows.map((r) => ({
        id: r.id,
        name: r.name,
        excluded: r.excluded,
        alignment: r.alignment,
      })),
    };
  }

  return model;
}
