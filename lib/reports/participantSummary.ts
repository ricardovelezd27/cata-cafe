// Pure builder for the "Resumen del participante" report. Everything a cupper
// may see about THEMSELVES and the anonymous group; nothing else.
//
// ANONYMITY INVARIANT (tested in tests/reports.test.ts): the returned model
// contains no other cupper's id or display name, no per-cupper alignment row,
// and no physical (green-bean) data. The only identity in it is the viewer's.

import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { collectDescriptors } from "@/lib/descriptors";
import { calcIndividualScore, hasAffectiveData } from "@/lib/scoring";
import { deriveMyEvaluation, NO_EVALUATION } from "@/lib/evaluationState";
import { coffeeDisplayName } from "@/lib/coffeeAnonymize";
import { consensusLine, rankSamples, sessionStats, type RankableSample } from "./ranking";
import {
  blobForFormat,
  type ReportLabels,
  type ReportLocale,
  type SessionReportSource,
} from "./types";

export type ParticipantSummaryOptions = {
  viewerId: string;
  locale: ReportLocale;
  labels: ReportLabels;
};

export type SummaryDescriptor = {
  label: string;
  /** Whole percent of included evaluators who picked it. */
  pct: number;
  /** The viewer also picked it. */
  mine: boolean;
};

export type SummaryNote = { stage: string; text: string };

export type ParticipantSummarySample = {
  label: string;
  isReference: boolean;
  /** Only when the sample is revealed. */
  coffee: string | null;
  myScore: number | null;
  communityScore: number | null;
  sd: number | null;
  deltaVsRef: number | null;
  /** 8 values in AFFECTIVE_ATTRIBUTES order; null side = nothing to draw. */
  radar: { mine: number[] | null; community: number[] | null } | null;
  topDescriptors: SummaryDescriptor[];
  consensus: string | null;
  myNotes: SummaryNote[];
};

export type ParticipantSummaryModel = {
  header: {
    sessionName: string;
    date: Date;
    cupperName: string;
    format: string;
    cupsPerSample: number;
    /** Head-count only — never names. */
    participants: number;
    /** Label of the reference sample, or null. */
    referenceLabel: string | null;
  };
  kpis: {
    myAvg: number | null;
    communityAvg: number | null;
    delta: number | null;
    myAlignment: { alignment: number; matches: number; opportunities: number } | null;
    evaluated: number;
    total: number;
  };
  /** Reference first, then the others in ranking order. */
  samples: ParticipantSummarySample[];
};

const NOTE_STAGES = [
  "fragancia",
  "aroma",
  "sabor",
  "sabor_residual",
  "acidez",
  "dulzor",
  "sensacion",
] as const;

function attrValue(data: Record<string, unknown>, id: string): number {
  const n = Number(data[`${id}_final`] ?? data[id] ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The caller must have verified `canViewGroupResults` for group sessions;
 *  community numbers are then shown unconditionally. */
export function buildParticipantSummary(
  src: SessionReportSource,
  opts: ParticipantSummaryOptions,
): ParticipantSummaryModel {
  const { session } = src;
  const format = session.format;
  const mine = new Map(
    src.evals.filter((e) => e.cupperId === opts.viewerId).map((e) => [e.sessionSampleId, e]),
  );

  const rankables: (RankableSample & { sid: string })[] = src.samples.map((s) => {
    const ev = mine.get(s.id);
    const agg = src.groupAggBySample[s.id];
    const blob = ev ? blobForFormat(format, ev) : {};
    return {
      sid: s.id,
      id: s.id,
      referenceRank: s.referenceRank ?? null,
      descriptive: ev?.descriptiveData ?? {},
      affective: ev?.affectiveData ?? {},
      combined: ev?.combinedData ?? {},
      aggregateScore: agg
        ? { communityScore: agg.communityScore, scoreSd: agg.scoreSd }
        : null,
      // Source evals are submitted rows only, so status is "submitted".
      myEvaluation: ev ? deriveMyEvaluation(format, { isDraft: false, data: blob }) : NO_EVALUATION,
    };
  });

  const ctx = {
    format,
    isGroup: session.isGroup,
    canViewGroup: true,
    cupsPerSample: session.cupsPerSample,
  };
  const { anchors, ranked, refDeltas } = rankSamples(
    rankables,
    session.referenceSampleId,
    ctx,
  );
  const stats = sessionStats(rankables, ranked, session.referenceSampleId, ctx);

  const sampleById = new Map(src.samples.map((s) => [s.id, s]));
  const freqById = new Map((src.descriptorFrequency ?? []).map((f) => [f.sampleId, f]));

  const build = (
    r: { id: string },
    score: number | null,
    sd: number | null,
  ): ParticipantSummarySample => {
    const sample = sampleById.get(r.id)!;
    const ev = mine.get(r.id);
    const agg = src.groupAggBySample[r.id];
    const blob = ev ? blobForFormat(format, ev) : null;

    const myScore = (() => {
      if (!blob || format === "descriptive" || !hasAffectiveData(blob)) return null;
      const sc = calcIndividualScore(blob, session.cupsPerSample);
      return typeof sc === "number" ? sc : null;
    })();
    const communityScore =
      session.isGroup && format !== "descriptive" ? (agg?.communityScore ?? null) : null;

    let radar: ParticipantSummarySample["radar"] = null;
    if (format !== "descriptive") {
      const m =
        blob && hasAffectiveData(blob)
          ? AFFECTIVE_ATTRIBUTES.map((a) => attrValue(blob, a.id))
          : null;
      const c =
        session.isGroup && agg && agg.included > 0
          ? AFFECTIVE_ATTRIBUTES.map((a) => agg.attrAverages[a.label] ?? 0)
          : null;
      radar = m || c ? { mine: m, community: c } : null;
    }

    const freq = freqById.get(r.id);
    const myIds = new Set(
      format !== "affective" && ev ? collectDescriptors(blobForFormat(format, ev)) : [],
    );
    const total = freq?.totalEvaluators ?? 0;
    const topDescriptors: SummaryDescriptor[] = (freq?.blocks.general ?? [])
      .slice(0, 5)
      .map((d) => ({
        label: d.label,
        pct: total > 0 ? Math.round((d.count / total) * 100) : 0,
        mine: myIds.has(d.id),
      }));

    const myNotes: SummaryNote[] = [];
    if (blob) {
      for (const stage of NOTE_STAGES) {
        const text = blob[`${stage}_notas`];
        if (typeof text === "string" && text.trim() !== "") {
          myNotes.push({ stage, text: text.trim() });
        }
      }
    }

    return {
      label: sample.label,
      isReference: sample.isReference,
      coffee:
        sample.revealed && sample.coffee
          ? coffeeDisplayName(sample.coffee, opts.labels.coffeeDeleted)
          : null,
      myScore,
      communityScore,
      sd: score !== null && communityScore !== null && score === communityScore ? sd : null,
      deltaVsRef: refDeltas.get(r.id) ?? null,
      radar,
      topDescriptors,
      consensus: freq ? consensusLine(freq, !session.isGroup, opts.labels) : null,
      myNotes,
    };
  };

  // Every reference first (R1, R2…), then the ranking.
  const samples: ParticipantSummarySample[] = [];
  for (const a of anchors) samples.push(build(a.sample, a.rank.score, a.rank.sd));
  for (const r of ranked) samples.push(build(r.sample, r.score, r.sd));

  const myRow = src.alignmentRows.find((r) => r.id === opts.viewerId);
  const viewerName =
    src.participants.find((p) => p.userId === opts.viewerId)?.displayName ??
    src.evals.find((e) => e.cupperId === opts.viewerId)?.displayName ??
    (session.createdBy === opts.viewerId ? src.ownerName : "");

  return {
    header: {
      sessionName: session.name,
      date: session.date,
      cupperName: viewerName,
      format,
      cupsPerSample: session.cupsPerSample,
      participants: src.participants.length,
      referenceLabel: anchors.length
        ? anchors.map((a) => sampleById.get(a.sample.id)?.label ?? "").filter(Boolean).join(" · ")
        : null,
    },
    kpis: {
      myAvg: stats.myAvg,
      communityAvg: session.isGroup ? stats.communityAvg : null,
      delta: session.isGroup ? stats.delta : null,
      myAlignment: myRow
        ? {
            alignment: myRow.alignment,
            matches: myRow.matches,
            opportunities: myRow.opportunities,
          }
        : null,
      evaluated: stats.evaluatedCount,
      total: src.samples.length,
    },
    samples,
  };
}
