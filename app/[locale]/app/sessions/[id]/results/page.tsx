import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { collectDescriptors, PERCEPTUAL_BLOCKS } from "@/lib/descriptors";
import { computeSampleBlockFrequencies } from "@/lib/resultsAggregation";
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

      // Anonymous per-sample block frequencies + statistical summaries. Extracted
      // to lib/resultsAggregation so the close-session email path computes the
      // identical numbers — this page and the emailed group summary can never
      // disagree. Returns null only for affective sessions (guarded above).
      descriptorFrequency =
        computeSampleBlockFrequencies({
          format: session.format,
          samples: session.samples.map((s) => ({ id: s.id, label: s.label })),
          evals: evals.map((ev) => ({
            cupperId: ev.cupperId,
            sessionSampleId: ev.sessionSampleId,
            descriptiveData: ev.descriptiveData,
            combinedData: ev.combinedData,
          })),
          excludedUserIds,
          blockLabel: blockLabelFor,
          locale: localeStr,
        }) ?? null;

      // ---- Owner-only cupper alignment (Step 4) ----
      // Rebuilds its OWN selection matrix + majority sets: alignment is owner-only
      // and must never be part of the shared (emailed) aggregation, so it stays
      // here, separate from the anonymous frequency core above.
      if (isOwner) {
        // Per (sampleId → blockId → cupperId → Set<descriptorId>), including
        // excluded cuppers so their (flagged) rows can be scored against the
        // excluded-free consensus.
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
          const bySel = selections.get(ev.sessionSampleId);
          if (!bySel) continue;
          const blob = blobFor(ev);
          if (!blob) continue;
          if (!excludedUserIds.has(ev.cupperId)) {
            evaluatorsPerSample.get(ev.sessionSampleId)!.add(ev.cupperId);
          }
          for (const block of PERCEPTUAL_BLOCKS) {
            const ids = collectDescriptors(blob, block.descKeys);
            bySel.get(block.id)!.set(ev.cupperId, new Set(ids));
          }
        }

        // Consensus (majority) sets per sample+block: descriptors picked by >= 50%
        // of that block's INCLUDED evaluators, min 2 cuppers.
        const majoritySets = new Map<string, Map<string, Set<string>>>();
        for (const s of session.samples) {
          const bySel = selections.get(s.id)!;
          const total = evaluatorsPerSample.get(s.id)!.size;
          const sampleMajority = new Map<string, Set<string>>();
          for (const block of PERCEPTUAL_BLOCKS) {
            const counts = new Map<string, number>();
            for (const [cupperId, set] of bySel.get(block.id)!) {
              if (excludedUserIds.has(cupperId)) continue; // consensus excludes them
              for (const did of set) counts.set(did, (counts.get(did) ?? 0) + 1);
            }
            const majority = new Set(
              [...counts.entries()]
                .filter(([, c]) => c >= 2 && total > 0 && c / total >= 0.5)
                .map(([did]) => did),
            );
            sampleMajority.set(block.id, majority);
          }
          majoritySets.set(s.id, sampleMajority);
        }

        // For each cupper, across all samples+blocks that HAVE a majority set,
        // alignment = matched majority descriptors / total majority opportunities.
        // Excluded cuppers are dropped from the consensus above but still get a
        // (flagged) row so the owner can see them. Their selections are present in
        // `selections` (we include every eval when building the matrix above), so
        // they score against the excluded-free consensus.
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
  const tResults = await getTranslations("results");
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

  // Freshness: the trigger stamps computedAt on every recompute, so the newest
  // computedAt across samples is "when community data last changed".
  let lastComputedAt: Date | null = null;
  for (const s of session.samples) {
    const at = s.aggregateScore?.computedAt ?? null;
    if (at && (!lastComputedAt || at > lastComputedAt)) lastComputedAt = at;
  }
  const participationLabel = session.isGroup
    ? tResults("participation", {
        submitted: submittedCupperCount,
        total: totalParticipants,
      })
    : null;
  const lastUpdatedLabel = lastComputedAt
    ? tResults("lastUpdated", {
        time: lastComputedAt.toLocaleString(locale === "es" ? "es-CO" : "en-US", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
      })
    : null;

  return (
    <ResultsClient
      locale={locale}
      isOwner={isOwner}
      isGroup={session.isGroup}
      sessionStatus={session.status}
      canViewGroup={canViewGroup}
      currentUserId={user.id}
      participationLabel={participationLabel}
      lastUpdatedLabel={lastUpdatedLabel}
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
            extrinsic: s.revealed ? ((s.extrinsic?.data as Record<string, unknown>) ?? {}) : {},
            aggregateScore,
          };
        }),
      }}
      translations={{
        title: tResults("title"),
        backToCupping: tResults("backToCupping"),
        refresh: tResults("refresh"),
        refreshing: tResults("refreshing"),
        // Template — the live count is substituted client-side.
        refreshNew: tResults("refreshNew", { count: "{count}" }),
        radarMine: tResults("mine"),
        radarCommunity: tResults("community"),
        deltaAttribute: tResults("deltaAttribute"),
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
        cloudTitle: tDesc("cloudTitle"),
        cloudScopeSession: tDesc("cloudScopeSession"),
        cloudScopeSample: tDesc("cloudScopeSample"),
        cloudScopeTaster: tDesc("cloudScopeTaster"),
        cloudEmpty: tDesc("cloudEmpty"),
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
