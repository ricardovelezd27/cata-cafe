import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import {
  collectDescriptors,
  resolveDescriptor,
  resolveMainTaste,
  PERCEPTUAL_BLOCKS,
} from "@/lib/descriptors";
import { summarizeSample, type SummaryBlock } from "@/lib/resultsSummary";
import { computeGroupAggregate, type GroupAggregate } from "@/lib/scoring";
import { ResultsClient } from "./ResultsClient";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const [session, submittedCupperCount] = await Promise.all([
    prisma.cuppingSession.findFirst({
      where: {
        id,
        OR: [
          { createdBy: user.id },
          { participants: { some: { userId: user.id } } },
        ],
      },
      include: {
        samples: {
          orderBy: { position: "asc" },
          include: {
            evaluations: { where: { cupperId: user.id } },
            physical: true,
            extrinsic: true,
            aggregateScore: true,
            coffee: {
              select: {
                name: true,
                country: true,
                region: true,
                producer: true,
                variety: true,
                altitude: true,
                roastLevel: true,
                farm: true,
                processType: true,
              },
            },
          },
        },
        participants: { select: { userId: true, excludedFromResults: true } },
      },
    }),
    prisma.evaluation
      .groupBy({
        by: ["cupperId"],
        where: { sessionSample: { sessionId: id }, isDraft: false },
      })
      .then((rows) => rows.length),
  ]);

  if (!session) notFound();

  const isOwner = session.createdBy === user.id;

  // Block labels are needed inside the server aggregation below, so resolve the
  // translators up front.
  const tBlocks = await getTranslations("blocks");

  const totalParticipants = session.participants.length;
  const allSubmitted = totalParticipants > 0 && submittedCupperCount >= totalParticipants;
  const sessionExpired = session.closesAt ? session.closesAt < new Date() : false;
  const canViewGroup =
    session.isGroup &&
    (isOwner || session.status === "closed" || allSubmitted || sessionExpired);

  // Participants the master has excluded from group results. Used to (a) flag
  // excluded cuppers in the Individual view and (b) drop their descriptors from
  // the anonymous frequency counts. Community/aggregate scores are filtered by
  // the DB trigger, so no extra work is needed there.
  const excludedUserIds = new Set(
    session.participants.filter((p) => p.excludedFromResults).map((p) => p.userId),
  );

  // Master-only: every cupper's submitted evaluation, for the Individual view.
  // Gated by isOwner so non-owners never receive other participants' raw data.
  type ParticipantResult = {
    id: string;
    name: string;
    excluded: boolean;
    samples: {
      id: string;
      label: string;
      revealed: boolean;
      coffee: { name: string } | null;
      descriptive: Record<string, unknown>;
      affective: Record<string, unknown>;
      combined: Record<string, unknown>;
    }[];
  };
  let participantResults: ParticipantResult[] | null = null;

  // Anonymous, per-sample, per-BLOCK descriptor frequency — counts only, no
  // identities. Visible to all participants once group results are viewable.
  // Blocks are the perceptual grouping (Nariz / Boca / Gusto / Acidez / Dulzura
  // / Sensación); each block is deduped per cupper before counting (N15).
  type RankedDescriptor = { id: string; label: string; color: string; count: number };
  type SampleBlockFreq = {
    sampleId: string;
    label: string;
    totalEvaluators: number;
    blocks: Record<string, RankedDescriptor[]>;
    // Per-block statistical summary sentences (null text → empty state).
    summary: Record<string, string | null>;
  };
  let descriptorFrequency: SampleBlockFreq[] | null = null;

  // Owner-only: per-cupper alignment with the group consensus (N15, Step 4).
  type CupperAlignmentRow = {
    id: string;
    name: string;
    excluded: boolean;
    alignment: number; // 0..1 overlap ratio vs majority sets
    matches: number;
    opportunities: number;
  };
  let cupperAlignment: CupperAlignmentRow[] | null = null;

  // Per-sample group aggregate recomputed in TS from the raw evaluations,
  // INCLUDING ONLY complete ones. Overrides the trigger-stored AggregateScore so
  // incomplete/empty submissions don't skew the community average. Keyed by
  // sessionSampleId.
  let groupAggBySample: Map<string, GroupAggregate> | null = null;

  if (canViewGroup && session.isGroup) {
    const evals = await prisma.evaluation.findMany({
      where: { sessionSample: { sessionId: id }, isDraft: false },
      select: {
        cupperId: true,
        sessionSampleId: true,
        descriptiveData: true,
        affectiveData: true,
        combinedData: true,
        nonUniformCups: true,
        defectiveCups: true,
        cupper: { select: { id: true, displayName: true } },
      },
    });

    // Recompute each sample's community aggregate, excluding master-excluded
    // cuppers and (inside computeGroupAggregate) incomplete evaluations.
    groupAggBySample = new Map<string, GroupAggregate>();
    {
      const bySample = new Map<string, (typeof evals)[number][]>();
      for (const ev of evals) {
        if (excludedUserIds.has(ev.cupperId)) continue;
        const list = bySample.get(ev.sessionSampleId);
        if (list) list.push(ev);
        else bySample.set(ev.sessionSampleId, [ev]);
      }
      for (const [sampleId, list] of bySample) {
        groupAggBySample.set(
          sampleId,
          computeGroupAggregate(
            list.map((ev) => ({
              data: (session.format === "combined"
                ? ev.combinedData
                : ev.affectiveData) as Record<string, unknown>,
              nonUniformCups: ev.nonUniformCups,
              defectiveCups: ev.defectiveCups,
            })),
            session.cupsPerSample,
          ),
        );
      }
    }

    // ---- Master-only raw participant matrix (Individual view) ----
    if (isOwner) {
      const byCupper = new Map<
        string,
        { name: string; bySample: Map<string, (typeof evals)[number]> }
      >();
      for (const ev of evals) {
        let entry = byCupper.get(ev.cupperId);
        if (!entry) {
          entry = { name: ev.cupper.displayName, bySample: new Map() };
          byCupper.set(ev.cupperId, entry);
        }
        entry.bySample.set(ev.sessionSampleId, ev);
      }

      participantResults = [...byCupper.entries()]
        .map(([cupperId, entry]) => ({
          id: cupperId,
          name: entry.name,
          excluded: excludedUserIds.has(cupperId),
          samples: session.samples.map((s) => {
            const ev = entry.bySample.get(s.id);
            return {
              id: s.id,
              label: s.label,
              revealed: s.revealed,
              coffee: s.revealed && s.coffee ? { name: s.coffee.name } : null,
              descriptive: (ev?.descriptiveData as Record<string, unknown>) ?? {},
              affective: (ev?.affectiveData as Record<string, unknown>) ?? {},
              combined: (ev?.combinedData as Record<string, unknown>) ?? {},
            };
          }),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, locale === "es" ? "es" : "en"));
    }

    // ---- Anonymous block frequency + summaries + alignment ----
    // Descriptors live in a different JSON column per format; affective has none.
    if (session.format !== "affective") {
      const blobFor = (
        ev: (typeof evals)[number]
      ): Record<string, unknown> | null =>
        session.format === "combined"
          ? (ev.combinedData as Record<string, unknown>)
          : session.format === "descriptive"
            ? (ev.descriptiveData as Record<string, unknown>)
            : null;

      const localeStr = locale === "en" ? "en" : "es";
      const blockLabelFor = (blockId: string): string =>
        tBlocks(blockId as Parameters<typeof tBlocks>[0]);

      // Resolve a raw descriptor id to a label+color for a given block. The
      // `gusto` (taste) block resolves against MAIN_TASTES; all others against
      // the flavor wheel / CATA sets.
      const resolveForBlock = (blockKind: string, id: string) =>
        blockKind === "taste"
          ? resolveMainTaste(id, localeStr)
          : resolveDescriptor(id, localeStr);

      // Per (sampleId → blockId) the set of descriptor ids each INCLUDED cupper
      // selected, deduped within the block (per-cupper union across the block's
      // stages). This single matrix feeds frequency, summaries AND alignment so
      // the three views can never disagree.
      // selections[sampleId][blockId] = { cupperId → Set<descriptorId> }
      type BlockSel = Map<string, Map<string, Set<string>>>;
      const selections = new Map<string, BlockSel>();
      const evaluatorsPerSample = new Map<string, Set<string>>();
      for (const s of session.samples) {
        const bySel: BlockSel = new Map();
        for (const block of PERCEPTUAL_BLOCKS) bySel.set(block.id, new Map());
        selections.set(s.id, bySel);
        evaluatorsPerSample.set(s.id, new Set());
      }

      for (const ev of evals) {
        if (excludedUserIds.has(ev.cupperId)) continue; // master-excluded cupper
        const bySel = selections.get(ev.sessionSampleId);
        if (!bySel) continue;
        const blob = blobFor(ev);
        if (!blob) continue;
        evaluatorsPerSample.get(ev.sessionSampleId)!.add(ev.cupperId);
        for (const block of PERCEPTUAL_BLOCKS) {
          // Per-cupper union across the block's keys (dedup so one cupper counts
          // once per descriptor in the block — the "nariz overlap" rule).
          const ids = collectDescriptors(blob, block.descKeys);
          const cupperSet = new Set(ids);
          bySel.get(block.id)!.set(ev.cupperId, cupperSet);
        }
      }

      // Consensus (majority) sets per sample+block: descriptors picked by >= 50%
      // of that block's evaluators, min 2 cuppers. Shared by summaries + alignment.
      const majoritySets = new Map<string, Map<string, Set<string>>>(); // sampleId → blockId → ids

      descriptorFrequency = session.samples.map((s) => {
        const bySel = selections.get(s.id)!;
        const total = evaluatorsPerSample.get(s.id)!.size;
        const blocksOut: Record<string, RankedDescriptor[]> = {};
        const sampleMajority = new Map<string, Set<string>>();

        const summaryBlocks: SummaryBlock[] = [];

        for (const block of PERCEPTUAL_BLOCKS) {
          // Count across cuppers (each cupper's deduped set contributes 1 each).
          const counts = new Map<string, number>();
          for (const set of bySel.get(block.id)!.values()) {
            for (const did of set) counts.set(did, (counts.get(did) ?? 0) + 1);
          }
          const ranked: RankedDescriptor[] = [...counts.entries()]
            .map(([did, count]) => {
              const info = resolveForBlock(block.kind, did);
              return info
                ? { id: did, label: info.label, color: info.color, count }
                : null;
            })
            .filter((d): d is RankedDescriptor => d !== null)
            .sort((a, b) => b.count - a.count);
          blocksOut[block.id] = ranked;

          // Majority set (>=50%, min 2 cuppers) for summaries + alignment.
          const majority = new Set(
            ranked
              .filter((d) => d.count >= 2 && total > 0 && d.count / total >= 0.5)
              .map((d) => d.id),
          );
          sampleMajority.set(block.id, majority);

          summaryBlocks.push({
            id: block.id,
            label: blockLabelFor(block.id),
            descriptors: ranked.map((d) => ({ id: d.id, label: d.label, count: d.count })),
            total,
          });
        }

        majoritySets.set(s.id, sampleMajority);

        const sentences = summarizeSample(summaryBlocks, localeStr);
        const summary: Record<string, string | null> = {};
        for (const sent of sentences) summary[sent.blockId] = sent.text;

        return {
          sampleId: s.id,
          label: s.label,
          totalEvaluators: total,
          blocks: blocksOut,
          summary,
        };
      });

      // ---- Owner-only cupper alignment (Step 4) ----
      // For each cupper, across all samples+blocks that HAVE a majority set,
      // alignment = matched majority descriptors / total majority opportunities.
      // Excluded cuppers are dropped from the consensus above but still get a
      // (flagged) row so the owner can see them.
      if (isOwner) {
        const rows = new Map<
          string,
          { name: string; excluded: boolean; matches: number; opportunities: number }
        >();
        for (const ev of evals) {
          if (!rows.has(ev.cupperId)) {
            rows.set(ev.cupperId, {
              name: ev.cupper.displayName,
              excluded: excludedUserIds.has(ev.cupperId),
              matches: 0,
              opportunities: 0,
            });
          }
        }

        for (const s of session.samples) {
          const bySel = selections.get(s.id)!;
          const sampleMajority = majoritySets.get(s.id)!;
          // Build per-cupper block selections INCLUDING excluded cuppers, so
          // excluded rows can still be scored against the (excluded-free)
          // consensus. Re-derive from raw evals for excluded cuppers.
          for (const [cupperId, row] of rows) {
            for (const block of PERCEPTUAL_BLOCKS) {
              const majority = sampleMajority.get(block.id)!;
              if (majority.size === 0) continue; // no consensus → no opportunity
              row.opportunities += majority.size;
              const cupperSet = bySel.get(block.id)!.get(cupperId);
              if (cupperSet) {
                for (const did of majority) if (cupperSet.has(did)) row.matches += 1;
              } else if (row.excluded) {
                // Excluded cupper's selections aren't in `bySel`; recover them.
                const ev = evals.find(
                  (e: (typeof evals)[number]) =>
                    e.cupperId === cupperId && e.sessionSampleId === s.id,
                );
                const blob = ev ? blobFor(ev) : null;
                if (blob) {
                  const ids = new Set(collectDescriptors(blob, block.descKeys));
                  for (const did of majority) if (ids.has(did)) row.matches += 1;
                }
              }
            }
          }
        }

        cupperAlignment = [...rows.entries()]
          .map(([id, r]) => ({
            id,
            name: r.name,
            excluded: r.excluded,
            matches: r.matches,
            opportunities: r.opportunities,
            alignment: r.opportunities > 0 ? r.matches / r.opportunities : 0,
          }))
          .sort((a, b) => {
            // Included cuppers first (by alignment desc), excluded last.
            if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
            return b.alignment - a.alignment;
          });
      }
    }
  }

  const tCommunity = await getTranslations("community");
  const tg = await getTranslations("group");
  const tDesc = await getTranslations("descriptors");
  const tAlign = await getTranslations("alignment");
  const tOffline = await getTranslations("offline");
  const t = await getTranslations("session");
  const tc = await getTranslations("coffee");
  const ta = await getTranslations("actions");

  // Group results must not silently average incomplete data. When fewer cuppers
  // have submitted (synced) than the participant roster, surface how many are
  // missing. computeGroupAggregate already excludes incomplete evals, so this is
  // an explicit "X of Y" denominator, not a recompute.
  const pendingParticipants = Math.max(0, totalParticipants - submittedCupperCount);
  const partialSyncNotice =
    session.isGroup && pendingParticipants > 0
      ? tOffline("partialSyncNotice", {
          included: submittedCupperCount,
          total: totalParticipants,
          pending: pendingParticipants,
        })
      : null;

  // Block label map (es/en) keyed by block id, for the descriptor subtabs.
  const blockLabels: Record<string, string> = {};
  for (const block of PERCEPTUAL_BLOCKS) {
    blockLabels[block.id] = tBlocks(block.id as Parameters<typeof tBlocks>[0]);
  }

  const dateStr = session.date.toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <ResultsClient
      locale={locale}
      isOwner={isOwner}
      isGroup={session.isGroup}
      sessionStatus={session.status}
      canViewGroup={canViewGroup}
      participants={participantResults}
      descriptorFrequency={descriptorFrequency}
      blockLabels={blockLabels}
      cupperAlignment={cupperAlignment}
      partialSyncNotice={partialSyncNotice}
      session={{
        id: session.id,
        name: session.name,
        format: session.format,
        cupsPerSample: session.cupsPerSample,
        date: dateStr,
        samples: session.samples.map((s) => {
          const ev = s.evaluations[0];
          const agg = s.aggregateScore;
          // Prefer the TS recompute (complete-only, with the real X-of-Y
          // denominator); fall back to the trigger row only when no recompute
          // exists (e.g. solo/non-group views).
          const recomputed = groupAggBySample?.get(s.id);
          const aggregateScore = recomputed
            ? {
                communityScore: recomputed.communityScore,
                avgRawScore: recomputed.avgRawScore,
                participantCount: recomputed.included,
                submittedCount: recomputed.submitted,
                totalCups: recomputed.totalCups,
                totalNonUniform: recomputed.totalNonUniform,
                totalDefective: recomputed.totalDefective,
                uniformityPenalty:
                  recomputed.totalCups > 0
                    ? recomputed.totalNonUniform * (10 / recomputed.totalCups)
                    : 0,
                defectPenalty:
                  recomputed.totalCups > 0
                    ? recomputed.totalDefective * (30 / recomputed.totalCups)
                    : 0,
                attrAverages: recomputed.attrAverages,
              }
            : agg
              ? {
                  communityScore: agg.communityScore,
                  avgRawScore: agg.avgRawScore,
                  participantCount: agg.participantCount,
                  submittedCount: agg.participantCount,
                  totalCups: agg.totalCups,
                  totalNonUniform: agg.totalNonUniform,
                  totalDefective: agg.totalDefective,
                  uniformityPenalty: agg.uniformityPenalty,
                  defectPenalty: agg.defectPenalty,
                  attrAverages: (agg.attrAverages as Record<string, number>) ?? {},
                }
              : null;
          return {
            id: s.id,
            label: s.label,
            revealed: s.revealed,
            coffee: s.revealed && s.coffee ? s.coffee : null,
            masterCoffee: isOwner
              ? {
                  name: s.coffee?.name ?? "",
                  country: s.coffee?.country ?? "",
                  region: s.coffee?.region ?? "",
                  farm: s.coffee?.farm ?? "",
                  producer: s.coffee?.producer ?? "",
                  variety: s.coffee?.variety ?? "",
                  processType: s.coffee?.processType ?? "",
                  altitude: s.coffee?.altitude ?? "",
                  roastLevel: s.coffee?.roastLevel ?? "",
                }
              : null,
            descriptive: (ev?.descriptiveData as Record<string, unknown>) ?? {},
            affective: (ev?.affectiveData as Record<string, unknown>) ?? {},
            combined: (ev?.combinedData as Record<string, unknown>) ?? {},
            physical: (s.physical?.data as Record<string, unknown>) ?? {},
            extrinsic: (s.extrinsic?.data as Record<string, unknown>) ?? {},
            aggregateScore,
          };
        }),
      }}
      translations={{
        myResults: locale === "es" ? "Mis resultados" : "My results",
        groupResults: locale === "es" ? "Resultados grupales" : "Group results",
        communityScore: tCommunity("score"),
        avgRaw: tCommunity("avgRaw"),
        participantCount: tCommunity("participantCount", { n: 0 }).replace("0", ""),
        radarChart: tCommunity("radarChart"),
        myScore: tCommunity("myScore"),
        delta: tCommunity("delta"),
        noGroupData: tCommunity("noGroupData"),
        reveal: tg("reveal"),
        revealed: tg("revealed"),
        descViewAll: tDesc("viewAll"),
        descOf: tDesc("of"),
        descParticipants: tDesc("participants"),
        descEmptyStage: tDesc("emptyStage"),
        descEmptyBlock: tDesc("emptyBlock"),
        descEmptyAll: tDesc("emptyAll"),
        alignTitle: tAlign("title"),
        alignSubtitle: tAlign("subtitle"),
        alignExcluded: tAlign("excluded"),
        alignNoData: tAlign("noData"),
        editSample: t("editSample"),
        editSampleError: t("editSampleError"),
        sampleLabel: t("sampleLabel"),
        coffeeName: t("coffeeName"),
        coffeeCountry: tc("country"),
        coffeeRegion: tc("region"),
        coffeeFarm: tc("farm"),
        producerRoaster: t("producerRoaster"),
        coffeeVariety: tc("variety"),
        coffeeProcess: tc("process"),
        coffeeAltitude: tc("altitude"),
        coffeeRoastLevel: tc("roastLevel"),
        save: ta("save"),
        saving: ta("saving"),
        cancel: ta("cancel"),
      }}
    />
  );
}
