import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { PERCEPTUAL_BLOCKS } from "@/lib/descriptors";
import { computeSampleBlockFrequencies } from "@/lib/resultsAggregation";
import { computeCupperAlignment, type CupperAlignmentRow } from "@/lib/alignment";
import { computeGroupAggregate, type GroupAggregate } from "@/lib/scoring";
import { asSessionFormat, type SessionFormat } from "@/lib/constants";
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

  // Super-admin god mode: read-only access to ANY session's results, rendered
  // from the owner's perspective. The admin's identity is resolved up front so
  // the "mine" evaluation slots below can be keyed to the owner instead.
  const isSuperAdmin = isSuperAdminEmail(user.email);
  const adminTarget = isSuperAdmin
    ? await prisma.cuppingSession.findUnique({
        where: { id },
        select: { createdBy: true, createdByUser: { select: { displayName: true } } },
      })
    : null;
  // Which cupper's evaluations fill the "mine" slots: the viewer's own, or —
  // for an admin viewing someone else's session — the owner's.
  const viewAsId =
    adminTarget && adminTarget.createdBy !== user.id ? adminTarget.createdBy : user.id;

  const [session, submittedCupperCount] = await Promise.all([
    prisma.cuppingSession.findFirst({
      where: isSuperAdmin
        ? { id }
        : {
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
            evaluations: { where: { cupperId: viewAsId } },
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
  // Admin viewing someone else's session: owner-equivalent READ access only.
  // Never conflated with isOwner, which keeps gating mutations (edit metadata,
  // reveal, refreshAggregateScores) — those actions stay owner-only. Note: a
  // super admin who is merely a PARTICIPANT of the session also gets this
  // owner-perspective view (their own "mine" lens is traded away) — accepted.
  const isAdminViewer = isSuperAdmin && !isOwner;
  // Owner-perspective read gate — shared by every owner-only READ block below.
  const ownerRead = isOwner || isAdminViewer;
  // Narrowed session format — used for every format-shaped gate below.
  // `session.format` (raw string) is still passed inside the `session` prop
  // unchanged, since the client-side type there is a plain string.
  const format: SessionFormat = asSessionFormat(session.format);

  // Block labels are needed inside the server aggregation below, so resolve the
  // translators up front.
  const tBlocks = await getTranslations("blocks");
  // Descriptor aggregation locale + block-label resolver — shared by both the
  // group (anonymous, cross-cupper) and solo (own-data) descriptor paths below.
  const localeStr: "es" | "en" = locale === "en" ? "en" : "es";
  const blockLabelFor = (blockId: string): string =>
    tBlocks(blockId as Parameters<typeof tBlocks>[0]);

  const totalParticipants = session.participants.length;
  const allSubmitted = totalParticipants > 0 && submittedCupperCount >= totalParticipants;
  const sessionExpired = session.closesAt ? session.closesAt < new Date() : false;
  const canViewGroup =
    session.isGroup &&
    (ownerRead || session.status === "closed" || allSubmitted || sessionExpired);

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
  // Full rows (names + ids) are exposed ONLY to the owner.
  let cupperAlignment: CupperAlignmentRow[] | null = null;

  // Every viewer's OWN alignment triple — no name, no id, no other cupper's
  // data. This is the ONLY alignment information a non-owner ever receives.
  let myAlignment: { alignment: number; matches: number; opportunities: number } | null = null;

  // Per-sample group aggregate recomputed in TS from the raw evaluations,
  // INCLUDING ONLY complete ones. Overrides the trigger-stored AggregateScore so
  // incomplete/empty submissions don't skew the community average. Keyed by
  // sessionSampleId.
  let groupAggBySample: Map<string, GroupAggregate> | null = null;

  // Ids of evaluations already visible at render time — seeds the client's
  // realtime-badge dedup set so a later no-op UPDATE storm (owner refresh,
  // exclusion toggle) doesn't re-badge evaluations the viewer already sees.
  let knownEvalIds: string[] = [];

  if (canViewGroup && session.isGroup) {
    const evals = await prisma.evaluation.findMany({
      where: { sessionSample: { sessionId: id }, isDraft: false },
      select: {
        id: true,
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

    knownEvalIds = evals.map((ev) => ev.id);

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
              data: (format === "combined"
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
    if (ownerRead) {
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
    if (format !== "affective") {
      // Anonymous per-sample block frequencies + statistical summaries. Extracted
      // to lib/resultsAggregation so the close-session email path computes the
      // identical numbers — this page and the emailed group summary can never
      // disagree. Returns null only for affective sessions (guarded above).
      descriptorFrequency =
        computeSampleBlockFrequencies({
          format,
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

      // ---- Cupper alignment (Step 4) ----
      // Extracted to lib/alignment.ts, which must never be imported by the
      // anonymous aggregation core — alignment carries per-cupper identity
      // (names, ids). Computed for EVERY viewer (needed for `myAlignment`
      // below), but the full row list is only ever assigned to the
      // owner-only `cupperAlignment` variable.
      const alignmentRows = computeCupperAlignment({
        format,
        samples: session.samples.map((s) => ({ id: s.id })),
        evals: evals.map((ev) => ({
          cupperId: ev.cupperId,
          sessionSampleId: ev.sessionSampleId,
          descriptiveData: ev.descriptiveData,
          combinedData: ev.combinedData,
          cupper: { displayName: ev.cupper.displayName },
        })),
        excludedUserIds,
      });

      if (ownerRead) {
        cupperAlignment = alignmentRows;
      }

      // Every viewer's own alignment triple — CRITICAL SECURITY INVARIANT:
      // only these three numbers about the CURRENT user leave this scope for
      // non-owners, never the row's id/name or any other cupper's row.
      const myRow = alignmentRows.find((r) => r.id === user.id);
      myAlignment = myRow
        ? {
            alignment: myRow.alignment,
            matches: myRow.matches,
            opportunities: myRow.opportunities,
          }
        : null;
    }
  }

  // ---- Solo sessions: descriptor data from the current user's own evaluations ----
  // Group sessions get the anonymous cross-cupper aggregation above; a solo
  // session has exactly one evaluator (the owner), so it feeds the SAME
  // aggregation core with a single synthesized eval per sample and skips the
  // majority-based summary sentences (skipSummaries) — a "majority of 1 of 1"
  // sentence would read absurd for a single cupper.
  const isSoloDescriptors = !session.isGroup;
  if (isSoloDescriptors && format !== "affective") {
    const soloEvals = session.samples.flatMap((s) => {
      const ev = s.evaluations[0];
      if (!ev) return [];
      return [
        {
          cupperId: user.id,
          sessionSampleId: s.id,
          descriptiveData: ev.descriptiveData,
          combinedData: ev.combinedData,
        },
      ];
    });
    descriptorFrequency =
      computeSampleBlockFrequencies(
        {
          format,
          samples: session.samples.map((s) => ({ id: s.id, label: s.label })),
          evals: soloEvals,
          excludedUserIds: new Set<string>(),
          blockLabel: blockLabelFor,
          locale: localeStr,
        },
        { skipSummaries: true },
      ) ?? null;
  }

  const tResults = await getTranslations("results");
  const tg = await getTranslations("group");
  const tDesc = await getTranslations("descriptors");
  const tAlign = await getTranslations("alignment");
  const tOffline = await getTranslations("offline");
  const t = await getTranslations("session");
  const tc = await getTranslations("coffee");
  const ta = await getTranslations("actions");
  const tCommon = await getTranslations("common");

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
  // "general" pseudo-block label — pairs with the `blocks["general"]` /
  // `summary["general"]` entries computeSampleBlockFrequencies now always adds.
  blockLabels.general = tBlocks("general");

  const participation = session.isGroup
    ? { submitted: submittedCupperCount, total: totalParticipants }
    : null;

  // Shared score-transparency translations ("¿Cómo se calculó?") — fed to both
  // the Resultados chart view (SampleRadarChart) and the personal drill-down
  // dialog (SampleDetail), so both surfaces stay in sync from one source.
  const breakdownT = {
    how: tResults("breakdown.how"),
    formula: tResults("breakdown.formula"),
    sigma: tResults("breakdown.sigma"),
    u: tResults("breakdown.u"),
    d: tResults("breakdown.d"),
    values: tResults("breakdown.values"),
    base: tResults("breakdown.base"),
    uniformity: tResults("breakdown.uniformity"),
    defects: tResults("breakdown.defects"),
    raw: tResults("breakdown.raw"),
    rounded: tResults("breakdown.rounded"),
    finalScore: tResults("breakdown.finalScore"),
    setupStamp: tResults("breakdown.setupStamp"),
    cups: tResults("breakdown.cups"),
    uniformityOn: tResults("breakdown.uniformityOn"),
    uniformityOff: tResults("breakdown.uniformityOff"),
    rounding025: tResults("breakdown.rounding025"),
    roundingOff: tResults("breakdown.roundingOff"),
    mode: tResults("breakdown.mode"),
    modeProfessional: tResults("breakdown.modeProfessional"),
    modeAcademic: tResults("breakdown.modeAcademic"),
    modeFree: tResults("breakdown.modeFree"),
    notTrackedNote: tResults("breakdown.notTrackedNote"),
    recorded: tResults("breakdown.recorded"),
    groupTitle: tResults("breakdown.groupTitle"),
    groupAvgRaw: tResults("breakdown.groupAvgRaw"),
    groupUniformity: tResults("breakdown.groupUniformity"),
    groupDefects: tResults("breakdown.groupDefects"),
    communityScore: tResults("breakdown.communityScore"),
    // Template — {n}/{total} are substituted client-side (same trick as refreshNew).
    includedNote: tResults("breakdown.includedNote", { n: "{n}", total: "{total}" }),
    groupExplain: tResults("breakdown.groupExplain"),
    perCup: tResults("breakdown.perCup"),
  };

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

  // Read-only banner for the super-admin view, interpolated server-side.
  const adminViewNotice = isAdminViewer
    ? tResults("adminViewNotice", {
        owner: adminTarget?.createdByUser.displayName ?? "—",
      })
    : null;

  return (
    <ResultsClient
      locale={locale}
      isOwner={isOwner}
      isAdminViewer={isAdminViewer}
      adminViewNotice={adminViewNotice}
      adminOwnerName={isAdminViewer ? (adminTarget?.createdByUser.displayName ?? null) : null}
      isGroup={session.isGroup}
      canViewGroup={canViewGroup}
      currentUserId={user.id}
      participationLabel={participationLabel}
      lastUpdatedLabel={lastUpdatedLabel}
      participants={participantResults}
      descriptorFrequency={descriptorFrequency}
      blockLabels={blockLabels}
      cupperAlignment={cupperAlignment}
      partialSyncNotice={partialSyncNotice}
      knownEvalIds={knownEvalIds}
      format={format}
      myAlignment={myAlignment}
      participation={participation}
      isSoloDescriptors={isSoloDescriptors}
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
            masterCoffee: ownerRead
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
        viewForm: tResults("viewForm"),
        downloadPdf: tResults("downloadPdf"),
        refresh: tResults("refresh"),
        refreshing: tResults("refreshing"),
        // Template — the live count is substituted client-side.
        refreshNew: tResults("refreshNew", { count: "{count}" }),
        radarMine: tResults("mine"),
        radarCommunity: tResults("community"),
        deltaAttribute: tResults("deltaAttribute"),
        flavorProfiles: tResults("flavorProfiles"),
        tabResumen: tResults("tabs.resumen"),
        tabResultados: tResults("tabs.resultados"),
        tabDescriptores: tResults("tabs.descriptores"),
        viewTable: tResults("views.table"),
        viewChart: tResults("views.chart"),
        communityPending: tResults("communityPending"),
        ownerSection: tResults("matrix.ownerSection"),
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
        filterSampleAll: tDesc("filterSampleAll"),
        filterBlockLabel: tDesc("filterBlockLabel"),
        soloCloudTitle: tDesc("soloCloudTitle"),
        tasterScopeAll: tDesc("tasterScopeAll"),
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
        dashboard: {
          statSamples: tResults("dashboard.statSamples"),
          statParticipation: tResults("dashboard.statParticipation"),
          statAvg: tResults("dashboard.statAvg"),
          statBest: tResults("dashboard.statBest"),
          statAvgMine: tResults("dashboard.statAvgMine"),
          statAvgCommunity: tResults("dashboard.statAvgCommunity"),
          ranking: tResults("dashboard.ranking"),
          notScored: tResults("dashboard.notScored"),
          performance: tResults("dashboard.performance"),
          myAvg: tResults("dashboard.myAvg"),
          communityAvg: tResults("dashboard.communityAvg"),
          alignmentLabel: tResults("dashboard.alignmentLabel"),
          alignmentNote: tResults("dashboard.alignmentNote"),
          highlights: tResults("dashboard.highlights"),
          soloTopDescriptors: tResults("dashboard.soloTopDescriptors"),
          viewInDescriptors: tResults("dashboard.viewInDescriptors"),
          communityPending: tResults("communityPending"),
        },
        table: {
          sample: tResults("table.sample"),
          descriptiveSection: tResults("table.descriptiveSection"),
          affectiveSection: tResults("table.affectiveSection"),
          cvaScore: tResults("table.cvaScore"),
          communityShort: tResults("table.communityShort"),
          legendMine: tResults("table.legendMine"),
          legendCommunity: tResults("table.legendCommunity"),
          viewDetail: tResults("table.viewDetail"),
          reveal: tg("reveal"),
          revealed: tg("revealed"),
        },
        detail: {
          fragrance: tResults("detail.fragrance"),
          aroma: tResults("detail.aroma"),
          flavor: tResults("detail.flavor"),
          aftertaste: tResults("detail.aftertaste"),
          acidity: tResults("detail.acidity"),
          sweetness: tResults("detail.sweetness"),
          mouthfeel: tResults("detail.mouthfeel"),
          overall: tResults("detail.overall"),
          intensity: tResults("detail.intensity"),
          quality: tResults("detail.quality"),
          notes: tResults("detail.notes"),
          cvaScore: tResults("detail.cvaScore"),
          edit: tResults("detail.edit"),
          noData: tResults("detail.noData"),
          nariz: tResults("detail.nariz"),
          boca: tResults("detail.boca"),
          gusto: tResults("detail.gusto"),
          acidezBlock: tResults("detail.acidezBlock"),
          dulzura: tResults("detail.dulzura"),
          sensacionBlock: tResults("detail.sensacionBlock"),
          descriptorSingular: tResults("detail.descriptorSingular"),
          descriptorPlural: tResults("detail.descriptorPlural"),
          avgQuality: tResults("detail.avgQuality"),
          noBlockData: tResults("detail.noBlockData"),
          myEvaluation: tResults("detail.myEvaluation"),
          viewingAs: tResults("detail.viewingAs"),
          editSample: tResults("detail.editSample"),
          close: tResults("detail.close"),
          breakdown: breakdownT,
        },
        breakdown: breakdownT,
        matrix: {
          title: tResults("matrix.matrixTitle"),
          manageTitle: tResults("matrix.manageTitle"),
          manageHint: tResults("matrix.manageHint"),
          included: tResults("matrix.included"),
          excluded: tResults("matrix.excluded"),
          excludedTag: tResults("matrix.excludedTag"),
          legendGreen: tResults("matrix.legendGreen"),
          legendAmber: tResults("matrix.legendAmber"),
          legendRed: tResults("matrix.legendRed"),
          noScore: tResults("matrix.noScore"),
        },
        help: {
          // "Cerrar" reads better than "Cancelar" for a read-only info dialog.
          closeLabel: tCommon("close"),
          stats: { title: tResults("help.stats.title"), body: tResults("help.stats.body") },
          ranking: { title: tResults("help.ranking.title"), body: tResults("help.ranking.body") },
          performance: {
            title: tResults("help.performance.title"),
            body: tResults("help.performance.body"),
          },
          highlights: {
            title: tResults("help.highlights.title"),
            body: tResults("help.highlights.body"),
          },
          tabla: { title: tResults("help.tabla.title"), body: tResults("help.tabla.body") },
          grafico: { title: tResults("help.grafico.title"), body: tResults("help.grafico.body") },
          porCatador: {
            title: tResults("help.porCatador.title"),
            body: tResults("help.porCatador.body"),
          },
          filtros: { title: tResults("help.filtros.title"), body: tResults("help.filtros.body") },
          nube: { title: tResults("help.nube.title"), body: tResults("help.nube.body") },
          frecuencia: {
            title: tResults("help.frecuencia.title"),
            body: tResults("help.frecuencia.body"),
          },
          alineacion: {
            title: tResults("help.alineacion.title"),
            body: tResults("help.alineacion.body"),
          },
        },
      }}
    />
  );
}
