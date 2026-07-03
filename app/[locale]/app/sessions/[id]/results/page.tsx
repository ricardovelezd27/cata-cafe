import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { collectDescriptors, resolveDescriptor, DESCRIPTOR_STAGES } from "@/lib/descriptors";
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

  // Anonymous, per-sample, per-stage descriptor frequency — counts only, no
  // identities. Visible to all participants once group results are viewable.
  type RankedDescriptor = { id: string; label: string; color: string; count: number };
  type SampleStageFreq = {
    sampleId: string;
    label: string;
    totalEvaluators: number;
    stages: Record<string, RankedDescriptor[]>;
  };
  let descriptorFrequency: SampleStageFreq[] | null = null;

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

    // ---- Anonymous descriptor frequency (all participants) ----
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

      // perSample[sampleId] = { total, stageCounts[stageId] = Map<descriptorId, count> }
      const perSample = new Map<
        string,
        { total: number; stageCounts: Map<string, Map<string, number>> }
      >();
      for (const s of session.samples) {
        const stageCounts = new Map<string, Map<string, number>>();
        for (const stage of DESCRIPTOR_STAGES) stageCounts.set(stage.id, new Map());
        perSample.set(s.id, { total: 0, stageCounts });
      }
      for (const ev of evals) {
        if (excludedUserIds.has(ev.cupperId)) continue; // master-excluded cupper
        const entry = perSample.get(ev.sessionSampleId);
        if (!entry) continue;
        const blob = blobFor(ev);
        if (!blob) continue;
        entry.total += 1;
        for (const stage of DESCRIPTOR_STAGES) {
          const counts = entry.stageCounts.get(stage.id)!;
          for (const did of collectDescriptors(blob, [stage.descKey])) {
            counts.set(did, (counts.get(did) ?? 0) + 1);
          }
        }
      }

      descriptorFrequency = session.samples.map((s) => {
        const entry = perSample.get(s.id)!;
        const stages: Record<string, RankedDescriptor[]> = {};
        for (const stage of DESCRIPTOR_STAGES) {
          stages[stage.id] = [...entry.stageCounts.get(stage.id)!.entries()]
            .filter(([, count]) => count >= 2)
            .map(([did, count]) => {
              const info = resolveDescriptor(did, locale === "en" ? "en" : "es");
              return info
                ? { id: did, label: info.label, color: info.color, count }
                : null;
            })
            .filter((d): d is RankedDescriptor => d !== null)
            .sort((a, b) => b.count - a.count);
        }
        return {
          sampleId: s.id,
          label: s.label,
          totalEvaluators: entry.total,
          stages,
        };
      });
    }
  }

  const tCommunity = await getTranslations("community");
  const tg = await getTranslations("group");
  const tAttr = await getTranslations("attributes");
  const tDesc = await getTranslations("descriptors");
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

  // Stage label map (es/en) keyed by stage id, for the descriptor subtabs.
  const stageLabels: Record<string, string> = {};
  for (const stage of DESCRIPTOR_STAGES) {
    stageLabels[stage.id] = tAttr(stage.attrId);
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
      stageLabels={stageLabels}
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
        descEmptyAll: tDesc("emptyAll"),
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
