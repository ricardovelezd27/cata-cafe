import "server-only";

// ONE fetch for the report models (participant summary, ficha tecnica,
// teacher notes). NO AUTHORIZATION HAPPENS HERE: the calling route must have
// already gated the viewer (owner / member / super-admin, plus
// canViewGroupResults for group data) before calling this. The returned
// source contains every cupper's identity and the owner-only physical data —
// the pure builders in this folder strip what each tier may not see.

import { prisma } from "@/lib/prisma";
import { activeReferenceId, orderReferencesFirst } from "@/lib/referenceRules";
import { asSessionFormat } from "@/lib/constants";
import { computeGroupAggregate, type GroupAggregate } from "@/lib/scoring";
import { sampleScoreRule } from "@/lib/scoreRule";
import { computeSampleBlockFrequencies } from "@/lib/resultsAggregation";
import { computeCupperAlignment, computeMajoritySets } from "@/lib/alignment";
import { resultsUpdatedAfterClose } from "@/lib/exclusionReasons";
import { profileDisplayName } from "@/lib/accountDeletion/deletedProfile";
import type { ReportLocale, SessionReportSource } from "./types";

export type { SessionReportSource } from "./types";

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});

export type SessionReportOptions = {
  /** Override the excluded set (default: participants flagged excludedFromResults). */
  excludedUserIds?: Set<string>;
  /** Locale of the descriptor summary sentences (default "es"). */
  locale?: ReportLocale;
  /** Block heading resolver for summary sentences (default: the block id). */
  blockLabel?: (blockId: string) => string;
};

/** Returns null when the session does not exist. */
export async function loadSessionReportSource(
  sessionId: string,
  options: SessionReportOptions = {},
): Promise<SessionReportSource | null> {
  const [session, evalRows] = await Promise.all([
    prisma.cuppingSession.findUnique({
      where: { id: sessionId },
      include: {
        createdByUser: { select: { displayName: true } },
        samples: {
          orderBy: { position: "asc" },
          include: {
            coffee: {
              select: {
                name: true,
                deletedAt: true,
                code: true,
                country: true,
                region: true,
                farm: true,
                producer: true,
                variety: true,
                processType: true,
                altitude: true,
                roastLevel: true,
              },
            },
            physical: true,
            extrinsic: true,
            // which rule the stored group score was computed under (lib/scoreRule.ts)
            aggregateScore: { select: { ruleVersion: true } },
          },
        },
        participants: {
          select: {
            userId: true,
            status: true,
            excludedFromResults: true,
            excludedAt: true,
            exclusionReason: true,
            user: { select: { displayName: true } },
          },
        },
      },
    }),
    prisma.evaluation.findMany({
      where: { sessionSample: { sessionId }, isDraft: false },
      select: {
        id: true,
        cupperId: true,
        sessionSampleId: true,
        descriptiveData: true,
        affectiveData: true,
        combinedData: true,
        nonUniformCups: true,
        defectiveCups: true,
        cups: true,
        cupper: { select: { displayName: true } },
      },
    }),
  ]);
  if (!session) return null;

  const format = asSessionFormat(session.format);
  const locale = options.locale ?? "es";
  const blockLabel = options.blockLabel ?? ((id: string) => id);

  const participants = session.participants.map((p) => ({
    userId: p.userId,
    displayName: profileDisplayName({ id: p.userId, displayName: p.user.displayName }, locale),
    status: p.status,
    excluded: p.excludedFromResults,
    exclusionReason: p.exclusionReason,
  }));
  const excludedUserIds =
    options.excludedUserIds ??
    new Set(participants.filter((p) => p.excluded).map((p) => p.userId));

  const evals = evalRows.map((ev) => ({
    id: ev.id,
    cupperId: ev.cupperId,
    displayName: profileDisplayName({ id: ev.cupperId, displayName: ev.cupper.displayName }, locale),
    sessionSampleId: ev.sessionSampleId,
    descriptiveData: asObj(ev.descriptiveData),
    affectiveData: asObj(ev.affectiveData),
    combinedData: asObj(ev.combinedData),
    nonUniformCups: ev.nonUniformCups,
    defectiveCups: ev.defectiveCups,
    cups: ev.cups,
  }));

  const samples = orderReferencesFirst(session.samples);
  // Multi-reference (S6): the active reference is the highest-ranked one; fall
  // back to the legacy column for rows written before referenceRank existed.
  const referenceSampleId = activeReferenceId(session.samples) ?? session.referenceSampleId;

  // Community aggregate per sample — same recompute as results/page.tsx:
  // excluded cuppers removed, incomplete evaluations dropped inside.
  const groupAggBySample: Record<string, GroupAggregate> = {};
  const bySample = new Map<string, typeof evals>();
  for (const ev of evals) {
    if (excludedUserIds.has(ev.cupperId)) continue;
    const list = bySample.get(ev.sessionSampleId);
    if (list) list.push(ev);
    else bySample.set(ev.sessionSampleId, [ev]);
  }
  const ruleBySample = new Map(
    session.samples.map((s) => [s.id, sampleScoreRule(s.aggregateScore)] as const),
  );
  for (const [sampleId, list] of bySample) {
    groupAggBySample[sampleId] = computeGroupAggregate(
      list.map((ev) => ({
        data: format === "combined" ? ev.combinedData : ev.affectiveData,
        nonUniformCups: ev.nonUniformCups,
        defectiveCups: ev.defectiveCups,
        cups: ev.cups ?? undefined,
      })),
      session.cupsPerSample,
      { rule: ruleBySample.get(sampleId) },
    );
  }

  const sampleIds = samples.map((s) => ({ id: s.id, label: s.label }));
  const descriptorFrequency =
    computeSampleBlockFrequencies({
      format,
      samples: sampleIds,
      evals: evals.map((ev) => ({
        cupperId: ev.cupperId,
        sessionSampleId: ev.sessionSampleId,
        descriptiveData: ev.descriptiveData,
        combinedData: ev.combinedData,
      })),
      excludedUserIds,
      blockLabel,
      locale,
    }) ?? null;

  const alignmentInput = {
    format,
    samples: sampleIds.map((s) => ({ id: s.id })),
    evals: evals.map((ev) => ({
      cupperId: ev.cupperId,
      sessionSampleId: ev.sessionSampleId,
      descriptiveData: ev.descriptiveData,
      combinedData: ev.combinedData,
      cupper: { displayName: ev.displayName },
    })),
    excludedUserIds,
  };
  const alignmentRows = computeCupperAlignment(alignmentInput);
  const majoritySets = computeMajoritySets(alignmentInput);

  // Disclosure for the report stamp (S8-12): who the group numbers rest on and
  // whether anything changed after the close.
  const submittedCuppers = new Set(evals.map((e) => e.cupperId));
  const includedCuppers = [...submittedCuppers].filter((id) => !excludedUserIds.has(id)).length;
  let originEditedAt: Date | null = null;
  for (const s of session.samples) {
    const at = s.revealed ? (s.extrinsic?.editedAt ?? null) : null;
    if (at && (!originEditedAt || at > originEditedAt)) originEditedAt = at;
  }
  const stamp = {
    inclusion: session.isGroup
      ? { included: includedCuppers, total: submittedCuppers.size }
      : null,
    resultsUpdatedAt:
      session.isGroup && session.status === "closed"
        ? resultsUpdatedAfterClose(
            session.closedAt,
            session.participants.map((p) => p.excludedAt),
          )
        : null,
    originEditedAt,
  };

  return {
    stamp,
    session: {
      id: session.id,
      name: session.name,
      date: session.date,
      objective: session.objective,
      format,
      cupsPerSample: session.cupsPerSample,
      isGroup: session.isGroup,
      status: session.status,
      createdBy: session.createdBy,
      referenceSampleId,
      closedAt: session.closedAt,
    },
    ownerName: profileDisplayName({ id: session.createdBy, displayName: session.createdByUser.displayName }, locale),
    samples: samples.map((s) => ({
      id: s.id,
      label: s.label,
      position: s.position,
      revealed: s.revealed,
      isReference: typeof s.referenceRank === "number" || s.id === referenceSampleId,
      referenceRank: s.referenceRank ?? null,
      coffee: s.coffee,
      physical: asObj(s.physical?.data),
      extrinsic: asObj(s.extrinsic?.data),
    })),
    participants,
    evals,
    excludedUserIds: [...excludedUserIds],
    submittedCupperCount: new Set(evals.map((e) => e.cupperId)).size,
    groupAggBySample,
    descriptorFrequency,
    alignmentRows,
    majoritySets,
  };
}
