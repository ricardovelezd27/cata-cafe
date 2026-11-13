import { notFound } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { orderReferencesFirst } from "@/lib/referenceRules";
import { profileDisplayName } from "@/lib/accountDeletion/deletedProfile";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { PERCEPTUAL_BLOCKS } from "@/lib/descriptors";
import { computeSampleBlockFrequencies } from "@/lib/resultsAggregation";
import { computeCupperAlignment, type CupperAlignmentRow } from "@/lib/alignment";
import { computeGroupAggregate, type GroupAggregate } from "@/lib/scoring";
import { evaluationScoreRule, sampleScoreRule, type ScoreRule } from "@/lib/scoreRule";
import { asSessionFormat, type SessionFormat } from "@/lib/constants";
import { coffeeDisplayName } from "@/lib/coffeeAnonymize";
import { deriveMyEvaluation, summarizeMyProgress } from "@/lib/evaluationState";
import { isSessionExpired, viewerMayReadGroupResults } from "@/lib/sessionState";
import { wasClosedSilently } from "@/lib/repairClose";
import { resultsUpdatedAfterClose } from "@/lib/exclusionReasons";
import { ownExclusionNotice } from "@/lib/exclusionNotice";
import { originEditedAfterClose } from "@/lib/originEdit";
import { gateSampleForViewer, communityHidden } from "@/lib/reports/sampleGate";
import { gateSamplePrep } from "@/lib/samplePrep";
import { getUsableCoffees } from "@/lib/coffees/queries";
import type { UsableCoffee } from "@/components/coffees/CoffeePicker";
import { closeSessionInternal } from "@/lib/closeSession";
import { ON_VIEW_REPAIR_GRACE_MS, canCloseNow, soloRepairOwedOnView } from "@/lib/closeRules";
import { errorMessage, logError } from "@/lib/log";
import { noIncludedAggregate } from "@/lib/reports/ranking";
import { ResultsClient } from "./ResultsClient";

// resendCloseEmails / refreshAggregateScores run from here; give the
// after() email fan-out room on Vercel.
export const maxDuration = 120;

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ closed?: string }>;
}) {
  const { locale, id } = await params;
  const { closed: closedParam } = await searchParams;
  setRequestLocale(locale);

  const user = await requireAppUser(locale, `/${locale}/app/sessions/${id}/results`);

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

  // S8-21: a SOLO owner whose session closed but never finalized (reveal +
  // coffee history) gets the repair now instead of waiting for the daily cron.
  // The 20 s grace keeps it from overlapping a close still in flight; a failure
  // only logs.
  try {
    const closeRow = await prisma.cuppingSession.findUnique({
      where: { id },
      select: { status: true, isGroup: true, createdBy: true, closedAt: true, closeFinalizedAt: true },
    });
    if (closeRow && soloRepairOwedOnView(closeRow, user.id)) {
      await closeSessionInternal(id, { reason: "repair", emails: "skip", repairGraceMs: ON_VIEW_REPAIR_GRACE_MS });
    }
  } catch (err) {
    logError({ where: "results.soloRepair", sessionId: id, message: errorMessage(err) });
  }

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
                deletedAt: true,
                updatedAt: true,
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
        participants: {
          select: {
            userId: true,
            excludedFromResults: true,
            excludedAt: true,
            excludedBy: true,
            exclusionReason: true,
          },
        },
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

  // The reference (control) sample leads every list on this page — tables,
  // radar cards, owner matrix — mirroring the cupping order (lib/referenceRules.ts).
  session.samples = orderReferencesFirst(session.samples);

  const isOwner = session.createdBy === user.id;
  // Admin viewing someone else's session: owner-equivalent READ access only.
  // Never conflated with isOwner, which keeps gating mutations (edit metadata,
  // reveal, refreshAggregateScores) — those actions stay owner-only. Note: a
  // super admin who is merely a PARTICIPANT of the session also gets this
  // owner-perspective view (their own "mine" lens is traded away) — accepted.
  const isAdminViewer = isSuperAdmin && !isOwner;
  // Owner-perspective read gate — shared by every owner-only READ block below.
  const ownerRead = isOwner || isAdminViewer;
  // B1: a "free" reference is scored like any sample (no "79.00 anchor" copy).
  const referenceFree = session.referenceMode === "free";
  // Narrowed session format — used for every format-shaped gate below.
  // `session.format` (raw string) is still passed inside the `session` prop
  // unchanged, since the client-side type there is a plain string.
  const format: SessionFormat = asSessionFormat(session.format);

  // Block labels are needed inside the server aggregation below, so resolve the
  // translators up front.
  const tBlocks = await getTranslations("blocks");
  // Fetched early — needed below by the owner-only participant matrix
  // (coffeeDisplayName fallback) before the rest of the page's translators.
  const tCommon = await getTranslations("common");
  const tErrors = await getTranslations("errors");
  // Descriptor aggregation locale + block-label resolver — shared by both the
  // group (anonymous, cross-cupper) and solo (own-data) descriptor paths below.
  const localeStr: "es" | "en" = locale === "en" ? "en" : "es";
  const blockLabelFor = (blockId: string): string =>
    tBlocks(blockId as Parameters<typeof tBlocks>[0]);

  const totalParticipants = session.participants.length;
  const sessionExpired = isSessionExpired({ status: "active", closesAt: session.closesAt });
  // Closed OR past its deadline: no more cupping, no more drafts to finish.
  const sessionOver = isSessionExpired(session);
  // The ONE call site of the group-visibility rule (shared with the report routes).
  const canViewGroup = viewerMayReadGroupResults(session, { ownerRead });

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
      isReference: boolean;
      referenceRank: number | null;
    }[];
  };
  let participantResults: ParticipantResult[] | null = null;

  // Anonymous, per-sample, per-BLOCK descriptor frequency — counts only, no
  // identities. Visible to all participants once group results are viewable.
  // Blocks are the perceptual grouping (Nariz / Boca / Gusto / Acidez / Dulzura
  // / Sensación); each block is deduped per cupper before counting (N15).
  type RankedDescriptor = { id: string; label: string; color: string; count: number };
  type RollupGroup = { id: string; label: string; color: string; level: 1 | 2; count: number; notes: string[] };
  type SampleBlockFreq = {
    sampleId: string;
    label: string;
    totalEvaluators: number;
    blocks: Record<string, RankedDescriptor[]>;
    stages?: Record<string, RankedDescriptor[]>;
    rollup?: Record<string, RollupGroup[]>;
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
  const ruleBySample = new Map<string, ScoreRule>();
  const submittedAllBySample = new Map<string, number>();

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
        cups: true,
        cupper: { select: { id: true, displayName: true } },
      },
    });

    knownEvalIds = evals.map((ev) => ev.id);

    // Recompute each sample's community aggregate, excluding master-excluded
    // cuppers and (inside computeGroupAggregate) incomplete evaluations.
    groupAggBySample = new Map<string, GroupAggregate>();
    // N for "n de N incluidos": submitted evaluations BEFORE the exclusion filter.
    for (const ev of evals) {
      submittedAllBySample.set(
        ev.sessionSampleId,
        (submittedAllBySample.get(ev.sessionSampleId) ?? 0) + 1,
      );
    }
    {
      const bySample = new Map<string, (typeof evals)[number][]>();
      for (const ev of evals) {
        if (excludedUserIds.has(ev.cupperId)) continue;
        const list = bySample.get(ev.sessionSampleId);
        if (list) list.push(ev);
        else bySample.set(ev.sessionSampleId, [ev]);
      }
      // Each sample is recomputed under the rule its STORED aggregate row says
      // (ruleVersion 1 = before 2026-11), so past results render unchanged.
      const cupsAllBySample = new Map<string, (number | null)[]>();
      for (const ev of evals) {
        const l = cupsAllBySample.get(ev.sessionSampleId);
        if (l) l.push(ev.cups);
        else cupsAllBySample.set(ev.sessionSampleId, [ev.cups]);
      }
      for (const s of session.samples) {
        ruleBySample.set(
          s.id,
          sampleScoreRule(s.aggregateScore, cupsAllBySample.get(s.id) ?? []),
        );
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
              cups: ev.cups ?? undefined,
              rule: evaluationScoreRule(ev.cups, true),
            })),
            session.cupsPerSample,
            { rule: ruleBySample.get(sampleId) },
          ),
        );
      }
    }

    // ---- Master-only raw participant matrix (Individual view) ----
    if (ownerRead) {
      // Who excluded whom (S8-12): the author is always the session owner, but
      // the column holds a plain id, so resolve names with one tiny lookup.
      const excluderIds = [
        ...new Set(
          session.participants
            .map((p) => p.excludedBy)
            .filter((x): x is string => typeof x === "string"),
        ),
      ];
      const excluderNames = new Map<string, string>(
        excluderIds.length
          ? (
              await prisma.profile.findMany({
                where: { id: { in: excluderIds } },
                select: { id: true, displayName: true },
              })
            ).map((p) => [p.id, profileDisplayName(p, localeStr)] as [string, string])
          : [],
      );
      const trailByUser = new Map(
        session.participants
          .filter((p) => p.excludedFromResults)
          .map((p) => [
            p.userId,
            {
              at: p.excludedAt
                ? p.excludedAt.toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : null,
              by: p.excludedBy ? (excluderNames.get(p.excludedBy) ?? null) : null,
              reason: p.exclusionReason ?? null,
            },
          ]),
      );
      const byCupper = new Map<
        string,
        { name: string; bySample: Map<string, (typeof evals)[number]> }
      >();
      for (const ev of evals) {
        let entry = byCupper.get(ev.cupperId);
        if (!entry) {
          entry = { name: profileDisplayName(ev.cupper, localeStr), bySample: new Map() };
          byCupper.set(ev.cupperId, entry);
        }
        entry.bySample.set(ev.sessionSampleId, ev);
      }

      participantResults = [...byCupper.entries()]
        .map(([cupperId, entry]) => ({
          id: cupperId,
          name: entry.name,
          excluded: excludedUserIds.has(cupperId),
          trail: trailByUser.get(cupperId) ?? null,
          samples: session.samples.map((s) => {
            const ev = entry.bySample.get(s.id);
            return {
              id: s.id,
              label: s.label,
              revealed: s.revealed,
              coffee:
                s.revealed && s.coffee
                  ? { name: coffeeDisplayName(s.coffee, tCommon("coffeeDeleted")) }
                  : null,
              descriptive: (ev?.descriptiveData as Record<string, unknown>) ?? {},
              affective: (ev?.affectiveData as Record<string, unknown>) ?? {},
              combined: (ev?.combinedData as Record<string, unknown>) ?? {},
              isReference: s.referenceRank != null,
              referenceRank: s.referenceRank ?? null,
              // cups NULL on a stored row = scored before the 2026-11 rule
              scoreRule: evaluationScoreRule(ev?.cups, ev !== undefined),
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
          cupper: { displayName: profileDisplayName(ev.cupper, localeStr) },
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
  const tGuestCta = await getTranslations("results.guestCta");

  // Group results must not silently average incomplete data. When fewer cuppers
  // have submitted (synced) than the participant roster, surface how many are
  // missing. computeGroupAggregate already excludes incomplete evals, so this is
  // an explicit "X of Y" denominator, not a recompute.
  // S10 WP4a (Kim C5): a count of who has submitted is group information, so it
  // only leaves the server for a viewer who may see group results (the owner
  // always, everyone else once the session is closed or expired).
  const pendingParticipants = Math.max(0, totalParticipants - submittedCupperCount);
  const partialSyncNotice =
    session.isGroup && canViewGroup && pendingParticipants > 0
      ? tOffline("partialSyncNotice", {
          included: submittedCupperCount,
          total: totalParticipants,
          pending: pendingParticipants,
        })
      : null;

  // Owner-only, closed group sessions: per-recipient close-email outcome, so
  // the owner can see who still needs a manual resend. Skipped entirely when
  // there are no participants (solo sessions, or a group with none yet).
  // Formatted server-side (ICU plural needs next-intl, not a client replace).
  type CloseEmailsSummary = { line: string; showResend: boolean };
  let closeEmails: CloseEmailsSummary | null = null;
  if (isOwner && session.isGroup && session.status === "closed" && totalParticipants > 0) {
    const deliveries = await prisma.closeEmailDelivery.findMany({
      where: { sessionId: id },
      select: { userId: true, status: true },
    });
    const seenUserIds = new Set(deliveries.map((d) => d.userId));
    let sent = 0;
    let noEmail = 0;
    let failed = 0;
    for (const d of deliveries) {
      if (d.status === "sent") sent += 1;
      else if (d.status === "skipped") noEmail += 1;
      else if (d.status === "failed") failed += 1;
    }
    // S9-01 B-08: a "sending" row is an in-flight (or abandoned) reservation: still pending.
    const inFlight = deliveries.filter((d) => d.status === "sending").length;
    const pending = session.participants.filter((p) => !seenUserIds.has(p.userId)).length + inFlight;
    const parts = [
      sent > 0 ? tResults("closeEmails.sent", { count: sent }) : null,
      noEmail > 0 ? tResults("closeEmails.noEmail", { count: noEmail }) : null,
      failed > 0 ? tResults("closeEmails.failed", { count: failed }) : null,
      pending > 0 ? tResults("closeEmails.pending", { count: pending }) : null,
    ].filter((p): p is string => p !== null);
    // Second review L4: a close that was silent (live group, idle 30+ days at close,
    // no ledger row) must not read as mail owed. The same pure rule the repair pass uses.
    const silent =
      deliveries.length === 0 && (await wasClosedSilently(id));
    closeEmails = silent
      ? { line: tResults("closeEmails.silent", { button: tResults("closeEmails.resend") }), showResend: true }
      : {
          line: `${tResults("closeEmails.label")} ${parts.join(" · ")}`,
          showResend: failed > 0 || pending > 0,
        };
  }

  // Neutral one-line notice for closed group sessions — formatted server-side
  // since next-intl's {date} placeholder is a required ICU arg.
  const closedOnLabel =
    session.isGroup && session.closedAt
      ? tResults("closedOn", {
          date: session.closedAt.toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
            dateStyle: "medium",
          }),
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

  const participation = session.isGroup && canViewGroup
    ? { submitted: submittedCupperCount, total: totalParticipants }
    : null;

  // The viewer's OWN evaluation state per sample. The `evaluations` include
  // above deliberately has no isDraft filter (a cupper may open results
  // mid-tasting), so every "my score" surface must know whether the row is a
  // draft and whether it is complete — otherwise an unfinished row prints "—"
  // cells with no explanation and a 5-filled placeholder score.
  const myEvaluationBySample = new Map(
    session.samples.map((s) => {
      const ev = s.evaluations[0];
      const data = (
        format === "combined"
          ? ev?.combinedData
          : format === "affective"
            ? ev?.affectiveData
            : ev?.descriptiveData
      ) as Record<string, unknown> | null | undefined;
      return [
        s.id,
        deriveMyEvaluation(format, ev ? { isDraft: ev.isDraft, data: data ?? {} } : null),
      ] as const;
    }),
  );
  const myProgress = summarizeMyProgress([...myEvaluationBySample.values()]);
  // Banner copy — null once everything is submitted, in the admin read-only
  // view (the "mine" slots hold the owner's rows), or on a closed session
  // (nothing can be finished anymore). Skipped when the viewer has not opened
  // a single sample: that is a plain "not evaluated" state, not "in progress".
  const hasAnyOwnRow = [...myEvaluationBySample.values()].some((m) => m.status !== "none");
  const myDraftNotice =
    !isAdminViewer && !sessionOver && hasAnyOwnRow && !myProgress.allSubmitted
      ? tResults("myDraftNotice", { complete: myProgress.complete, total: myProgress.total })
      : null;

  // F-grupal-2 / F-grupal-asincrona-1: a cupper who was cupping when the
  // session closed (or whose deadline passed) learns, in one persistent line,
  // whether their unsent notes counted. Under the default draft policy
  // (lib/closeRules.ts DRAFT_AT_CLOSE = "exclude") complete drafts are left
  // out. `?closed=1` is set by the /cup redirect and adds the plain statement
  // even when nothing was left unsent.
  const myUnsentComplete = [...myEvaluationBySample.values()].filter(
    (m) => m.status === "draft" && m.complete,
  ).length;
  const closedNotice =
    !isAdminViewer && sessionOver
      ? myUnsentComplete > 0
        ? tResults("closedUnsentNotice", { count: myUnsentComplete })
        : closedParam === "1"
          ? tResults("closedNotice")
          : null
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
    previousRule: tResults("breakdown.previousRule"),
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
  const hideCommunity = communityHidden({ ownerRead, isGroup: session.isGroup, canViewGroup });
  for (const s of hideCommunity ? [] : session.samples) {
    const at = s.aggregateScore?.computedAt ?? null;
    if (at && (!lastComputedAt || at > lastComputedAt)) lastComputedAt = at;
  }
  // Group results that changed AFTER the close (an owner exclusion/restore, a
  // recompute): say so, so an emailed summary or an old tab is not trusted blindly.
  const updatedAfterClose =
    session.isGroup && session.status === "closed" && !hideCommunity
      ? resultsUpdatedAfterClose(
          session.closedAt,
          session.participants.map((p) => p.excludedAt),
          [lastComputedAt],
        )
      : null;
  // S10 WP5a (D2): the excluded cupper's PRIVATE notice. ownExclusionNotice returns only
  // the viewer's own row, so no other cupper's exclusion can reach this payload.
  const exclusionReasonLabels: Record<string, string> = {
    sample_error: tResults("matrix.exclusionReasons.sample_error"),
    protocol: tResults("matrix.exclusionReasons.protocol"),
    incomplete: tResults("matrix.exclusionReasons.incomplete"),
    not_fit: tResults("matrix.exclusionReasons.not_fit"),
    test_duplicate: tResults("matrix.exclusionReasons.test_duplicate"),
    calibration: tResults("matrix.exclusionReasons.calibration"),
    other: tResults("matrix.exclusionReasons.other"),
  };
  const ownExclusion = session.isGroup
    ? ownExclusionNotice(session.participants, user.id, exclusionReasonLabels)
    : null;
  // F-cafes-9: origin data is live; say so when it changed after the session closed
  // (the sample's own origin record, or the linked coffee). One rule: lib/originEdit.ts.
  const originEditedAtFor = (s: {
    revealed: boolean;
    extrinsic?: { editedAt: Date | null } | null;
    coffee?: { updatedAt: Date } | null;
  }): Date | null =>
    s.revealed
      ? originEditedAfterClose({
          closedAt: session.closedAt,
          extrinsicEditedAt: s.extrinsic?.editedAt,
          coffeeUpdatedAt: s.coffee?.updatedAt,
        })
      : null;
  const exclusionNoticeLabel = ownExclusion
    ? ownExclusion.reason
      ? tResults("exclusionNotice", { reason: ownExclusion.reason })
      : tResults("exclusionNoticeNoReason")
    : null;
  const updatedAfterCloseLabel = updatedAfterClose
    ? tResults("updatedAfterClose", {
        date: updatedAfterClose.toLocaleString(locale === "es" ? "es-CO" : "en-US", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      })
    : null;
  const participationLabel = session.isGroup && canViewGroup
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
        owner: adminTarget ? profileDisplayName({ id: adminTarget.createdBy, displayName: adminTarget.createdByUser.displayName }, localeStr, "—") : "—",
      })
    : null;

  // "Asignar café": only the owner of a CLOSED session with coffee-less
  // samples can pick an existing coffee, so only then ship the list.
  const needsCoffeePicker =
    isOwner && !isAdminViewer && session.status === "closed" && session.samples.some((s) => s.coffeeId === null);
  const usableCoffees: UsableCoffee[] = needsCoffeePicker
    ? (await getUsableCoffees(user.id)).map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        producer: c.producer,
        variety: c.variety,
        altitude: c.altitude,
        roastLevel: c.roastLevel,
        country: c.country,
        region: c.region,
        processType: c.processType,
        origin: c.createdBy === user.id ? "mine" : c.visibility === "public" ? "public" : "shared",
      }))
    : [];

  return (
    <ResultsClient
      locale={locale}
      usableCoffees={usableCoffees}
      isOwner={isOwner}
      isAdminViewer={isAdminViewer}
      adminViewNotice={adminViewNotice}
      adminOwnerName={isAdminViewer && adminTarget ? profileDisplayName({ id: adminTarget.createdBy, displayName: adminTarget.createdByUser.displayName }, localeStr) : null}
      isGroup={session.isGroup}
      canViewGroup={canViewGroup}
      cuppingOpen={!sessionOver}
      sessionClosed={session.status === "closed"}
      closedOnLabel={closedOnLabel}
      updatedAfterCloseLabel={updatedAfterCloseLabel}
      exclusionNotice={exclusionNoticeLabel}
      closeEmails={closeEmails}
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
      guestSave={
        user.is_anonymous
          ? {
              title: tGuestCta("title"),
              body: tGuestCta("body"),
              cta: tGuestCta("cta"),
              ctaLoading: tGuestCta("ctaLoading"),
              dismiss: tGuestCta("dismiss"),
              offline: tGuestCta("offline"),
              error: tGuestCta("error"),
            }
          : null
      }
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
                scoreSd: recomputed.scoreSd,
                participantCount: recomputed.included,
                submittedCount: recomputed.submitted,
                totalSubmitted: submittedAllBySample.get(s.id) ?? recomputed.submitted,
                totalCups: recomputed.totalCups,
                totalNonUniform: recomputed.totalNonUniform,
                totalDefective: recomputed.totalDefective,
                uniformityPenalty: recomputed.uniformityPenalty,
                defectPenalty: recomputed.defectPenalty,
                rule: ruleBySample.get(s.id) ?? sampleScoreRule(agg),
                attrAverages: recomputed.attrAverages,
              }
            : groupAggBySample && (submittedAllBySample.get(s.id) ?? 0) > 0
              ? // B-07: every submitted evaluation is excluded -> n = 0, no score
                // (never the trigger row's COALESCE(avg, 0) = 0).
                noIncludedAggregate(submittedAllBySample.get(s.id) ?? 0)
              : agg
              ? {
                  communityScore: agg.communityScore,
                  avgRawScore: agg.avgRawScore,
                  scoreSd: null,
                  participantCount: agg.participantCount,
                  submittedCount: agg.participantCount,
                  totalSubmitted: agg.participantCount,
                  totalCups: agg.totalCups,
                  totalNonUniform: agg.totalNonUniform,
                  totalDefective: agg.totalDefective,
                  uniformityPenalty: agg.uniformityPenalty,
                  defectPenalty: agg.defectPenalty,
                  rule: sampleScoreRule(agg),
                  attrAverages: (agg.attrAverages as Record<string, number>) ?? {},
                }
              : null;
          // Server-side viewer gate: physical sheet owner-only, community
          // numbers withheld while a group session's results are hidden.
          const gated = gateSampleForViewer(
            {
              physical: (s.physical?.data as Record<string, unknown>) ?? {},
              aggregateScore,
            },
            { ownerRead, isGroup: session.isGroup, canViewGroup },
          );
          return {
            id: s.id,
            label: s.label,
            revealed: s.revealed,
            coffee:
              s.revealed && s.coffee
                ? {
                    name: coffeeDisplayName(s.coffee, tCommon("coffeeDeleted")),
                    country: s.coffee.country,
                    region: s.coffee.region,
                    producer: s.coffee.producer,
                    variety: s.coffee.variety,
                    altitude: s.coffee.altitude,
                    roastLevel: s.coffee.roastLevel,
                  }
                : null,
            // S8-21: an unrevealed sample's coffee link is blind data; only the
            // owner/admin (or a revealed sample) learns whether one exists. Every
            // consumer in ResultsClient is also owner-gated.
            hasCoffee: ownerRead || s.revealed ? s.coffeeId !== null : false,
            // Never re-identify an anonymized coffee in the owner's edit form.
            masterCoffee: ownerRead && !s.coffee?.deletedAt
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
            physical: gated.physical,
            // A9: blind data, so the owner/admin lens or a revealed sample only.
            prep: gateSamplePrep(s, { ownerView: ownerRead, revealed: s.revealed }),
            extrinsic: s.revealed ? ((s.extrinsic?.data as Record<string, unknown>) ?? {}) : {},
            // "Datos de origen editados el <fecha>" — only after the close (S8-12, F-cafes-9).
            extrinsicEditedLabel: originEditedAtFor(s)
              ? tResults("originEditedAt", {
                    date: originEditedAtFor(s)!.toLocaleDateString(
                      locale === "es" ? "es-CO" : "en-US",
                      { day: "numeric", month: "short", year: "numeric" },
                    ),
                  })
                : null,
            aggregateScore: gated.aggregateScore,
            // rule of the VIEWER'S own evaluation: cups NULL on a stored row = before 2026-11
            scoreRule: evaluationScoreRule(ev?.cups, ev !== undefined),
            isReference: s.referenceRank != null,
            referenceRank: s.referenceRank ?? null,
            myEvaluation: myEvaluationBySample.get(s.id) ?? { status: "none", complete: false },
          };
        }),
      }}
      myDraftNotice={myDraftNotice}
      closedNotice={closedNotice}
      // Review M2 (Kim C9): an expired, not closed group session has no other way
      // out if the nightly job fails, so its OWNER can close it now.
      closeNow={
        canCloseNow({
          isOwner,
          isGroup: session.isGroup,
          status: session.status,
          expired: sessionExpired,
        })
          ? {
              line: tResults("closeNow.line"),
              button: tResults("closeNow.button"),
              title: tg("closeSession"),
              body: tg("confirmClose"),
              rule: tg("closeRule"),
              cancel: ta("cancel"),
              error: tg("closeSessionError"),
              notFinalized: tg("closeNotFinalized"),
            }
          : null
      }
      finish={
        !isAdminViewer && !session.isGroup && isOwner && !sessionOver
          ? {
              button: tResults("finish.button"),
              title: tResults("finish.title"),
              body: tResults("finish.body"),
              submitLine: tResults.raw("finish.submitLine") as string,
              removeLine: tResults.raw("finish.removeLine") as string,
              keepLine: tResults.raw("finish.keepLine") as string,
              confirm: tResults("finish.confirm"),
              cancel: tResults("finish.cancel"),
              close: tResults("finish.cancel"),
              errors: tErrors.raw("codes") as Record<string, string>,
            }
          : null
      }
      sync={{
        syncing: tResults("sync.syncing", { count: "{count}" }),
        pending: tResults("sync.pending", { count: "{count}" }),
        offline: tResults("sync.offline", { count: "{count}" }),
        retry: tResults("sync.retry"),
        synced: tResults("sync.synced"),
        closedUnsent: tResults("sync.closedUnsent", { count: "{count}" }),
        conflictTitle: tOffline("conflictTitle"),
        // Raw template — `{sample}` is filled client-side by SyncConflictModal.
        conflictBody: tOffline.raw("conflictBody") as string,
        conflictKeep: tOffline("conflictKeep"),
        conflictReplace: tOffline("conflictReplace"),
      }}
      translations={{
        title: tResults("title"),
        backToCupping: tResults("backToCupping"),
        viewForm: tResults("viewForm"),
        downloadPdf: tResults("downloadPdf"),
        downloadSummary: tResults("downloadSummary"),
        downloadFicha: tResults("downloadFicha"),
        downloadCsv: tResults("downloadCsv"),
        downloadCsvNoNames: tResults("downloadCsvNoNames"),
        needsConnection: tResults("needsConnection"),
        refresh: tResults("refresh"),
        refreshing: tResults("refreshing"),
        // Template — the live count is substituted client-side.
        refreshNew: tResults("refreshNew", { count: "{count}" }),
        refreshNewGeneric: tResults("refreshNewGeneric"),
        radarMine: tResults("mine"),
        radarCommunity: tResults("community"),
        deltaAttribute: tResults("deltaAttribute"),
        radar: {
          score: tResults("radar.score"),
          reveal: tResults("radar.reveal"),
          communityScore: tResults("radar.communityScore"),
          // {n}/{total} are substituted client-side.
          includedLine: tResults.raw("radar.includedLine") as string,
          noAffective: tResults("radar.noAffective"),
          requiresAffective: tResults("radar.requiresAffective"),
        },
        flavorProfiles: tResults("flavorProfiles"),
        referenceBadge: tResults("referenceBadge"),
        // `{n}` is an ICU arg — fetched raw and replaced client-side.
        referenceN: tResults.raw("referenceN") as string,
        compareWith: tResults("compareWith"),
        deltaVsReference: tResults("deltaVsReference"),
        deltaVsReferenceAria: tResults("deltaVsReferenceAria"),
        referenceLegend: tResults("referenceLegend"),
        tabResumen: tResults("tabs.resumen"),
        tabResultados: tResults("tabs.resultados"),
        tabDescriptores: tResults("tabs.descriptores"),
        viewTable: tResults("views.table"),
        viewChart: tResults("views.chart"),
        communityPending: tResults("communityPending"),
        ownerSection: tResults("matrix.ownerSection"),
        liveUpdatesDown: tResults("liveUpdatesDown"),
        myDraftCta: tResults("myDraftCta"),
        closeEmailsResend: tResults("closeEmails.resend"),
        closeEmailsResending: tResults("closeEmails.resending"),
        closeEmailsResent: tResults("closeEmails.resent"),
        closeEmailsResendError: tResults("closeEmails.resendError"),
        closeEmailsInProgress: tResults("closeEmails.inProgress"),
        descViewAll: tDesc("viewAll"),
        descByGroup: tDesc("byGroup"),
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
        hideSingles: tDesc("hideSingles"),
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
        assignPick: tResults("detail.assignPick"),
        assignedToast: tResults("detail.assignedToast"),
        coffeePicker: {
          title: tc("picker.title"),
          searchPlaceholder: tc("picker.searchPlaceholder"),
          mine: tc("picker.mine"),
          shared: tc("picker.shared"),
          public: tc("picker.public"),
          empty: tc("picker.empty"),
          close: tCommon("close"),
        },
        editSampleNotOwner: t("editSampleNotOwner"),
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
          sdAria: tResults("sdAria"),
          referenceBadge: tResults("referenceBadge"),
          deltaVsReference: tResults("deltaVsReference"),
          deltaVsReferenceAria: tResults("deltaVsReferenceAria"),
          anchorTitle: tResults(referenceFree ? "dashboard.anchorTitleFree" : "dashboard.anchorTitle"),
          anchorHint: tResults(referenceFree ? "dashboard.anchorHintFree" : "dashboard.anchorHint"),
          // Templates / ICU args: fetched raw, filled client-side.
          includedOf: tResults.raw("dashboard.includedOf") as string,
          rankIndicative: tResults("dashboard.rankIndicative"),
          rankNoClearGap: tResults("dashboard.rankNoClearGap"),
          basisMine: tResults("dashboard.basisMine"),
          fewNote: tResults("dashboard.fewNote"),
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
          inProgress: tResults("table.inProgress"),
          notEvaluated: tResults("table.notEvaluated"),
          inProgressLegend: tResults("table.inProgressLegend"),
        },
        detail: {
          prep: {
            roastDate: tResults("samplePrep.roastDate"),
            preparation: tResults("samplePrep.preparation"),
            offProtocol: tResults("samplePrep.offProtocol"),
          },
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
          inProgress: tResults("table.inProgress"),
          notEvaluated: tResults("table.notEvaluated"),
          avgQuality: tResults("detail.avgQuality"),
          noBlockData: tResults("detail.noBlockData"),
          myEvaluation: tResults("detail.myEvaluation"),
          viewingAs: tResults("detail.viewingAs"),
          editSample: tResults("detail.editSample"),
          editExtrinsic: tResults("detail.editExtrinsic"),
          expressNotes: tResults("detail.expressNotes"),
          assignCoffee: tResults("detail.assignCoffee"),
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
          sdHeader: tResults("matrix.sdHeader"),
          // ICU args: fetched raw and filled client-side.
          includedCount: tResults.raw("matrix.includedCount") as string,
          excludeDialogTitle: tResults("matrix.excludeDialogTitle"),
          excludeDialogBody: tResults("matrix.excludeDialogBody"),
          // S10 WP1a review L7: only when a sample is still scored under the previous rule.
          oldRuleNote: [...ruleBySample.values()].some((r) => r === "v1")
            ? tResults("matrix.oldRuleNote")
            : null,
          excludeReasonLabel: tResults("matrix.excludeReasonLabel"),
          excludeOtherLabel: tResults("matrix.excludeOtherLabel"),
          // S10 WP5a (D2): only once the session is closed.
          closedNote: session.status === "closed" ? tResults("matrix.closedNote") : null,
          excludeConfirm: tResults("matrix.excludeConfirm"),
          dialogCancel: tResults("matrix.dialogCancel"),
          dialogClose: tResults("matrix.dialogClose"),
          excludedTrail: tResults.raw("matrix.excludedTrail") as string,
          excludedToast: tResults("matrix.excludedToast"),
          restoredToast: tResults("matrix.restoredToast"),
          reasons: exclusionReasonLabels,
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
          referencia: {
            title: tResults("help.referencia.title"),
            body: tResults(referenceFree ? "help.referencia.bodyFree" : "help.referencia.body"),
          },
        },
      }}
    />
  );
}
