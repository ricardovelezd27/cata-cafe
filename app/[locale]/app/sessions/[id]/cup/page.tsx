import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { EmptyState, ButtonLink } from "@/components/ui";
import { CupClient } from "./CupClient";

// Server actions invoked from this page (closeSession → after() email fan-out
// with one PDF render per participant) inherit this budget on Vercel.
export const maxDuration = 120;

export default async function CupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ sample?: string }>;
}) {
  const { locale, id } = await params;
  const { sample: initialSampleId } = await searchParams;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const session = await prisma.cuppingSession.findFirst({
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
              farm: true,
              producer: true,
              variety: true,
              processType: true,
              altitude: true,
              roastLevel: true,
            },
          },
        },
      },
      participants: { select: { userId: true, status: true } },
    },
  });

  if (!session) {
    // Super-admin god mode is read-only: never the editable cupping form
    // (its upserts would fail the member gate anyway) — send the admin to
    // the results view of any session that actually exists.
    if (isSuperAdminEmail(user.email)) {
      const exists = await prisma.cuppingSession.findUnique({
        where: { id },
        select: { id: true },
      });
      if (exists) redirect(`/${locale}/app/sessions/${id}/results`);
    }
    notFound();
  }

  // A closed session's cupping form is final — send everyone to results.
  if (session.status === "closed") {
    redirect(`/${locale}/app/sessions/${id}/results`);
  }

  const isOwner = session.createdBy === user.id;

  // How many unique participants have submitted at least one evaluation
  const submittedParticipantsResult = await prisma.evaluation.findMany({
    where: {
      sessionSample: { sessionId: id },
      isDraft: false,
    },
    select: { cupperId: true },
    distinct: ["cupperId"],
  });

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { country: true },
  });

  const t = await getTranslations();
  const tg = await getTranslations("group");
  const tc = await getTranslations("coffee");
  const ta = await getTranslations("actions");

  if (session.samples.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <EmptyState
          title={t("cupping.noSamplesTitle")}
          body={t("cupping.noSamplesBody")}
          action={
            isOwner ? (
              <ButtonLink href={`/${locale}/app/sessions/${id}/edit`}>
                {t("session.edit.title")}
              </ButtonLink>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <CupClient
      locale={locale}
      initialSampleId={initialSampleId}
      isOwner={isOwner}
      isGroup={session.isGroup}
      userId={user.id}
      userEmail={user.email ?? undefined}
      userCountry={profile?.country ?? undefined}
      sessionStatus={session.status}
      sessionStartedAt={session.startedAt?.toISOString() ?? null}
      sessionIsAsync={session.isAsync}
      participantCount={session.participants.length}
      submittedCount={submittedParticipantsResult.length}
      session={{
        id: session.id,
        name: session.name,
        format: session.format,
        cupsPerSample: session.cupsPerSample,
        date: session.date.toISOString(),
        referenceSampleId: session.referenceSampleId,
        samples: session.samples.map((s) => {
          const ev = s.evaluations[0];
          return {
            id: s.id,
            label: s.label,
            position: s.position,
            isDraft: ev?.isDraft ?? true,
            evaluationId: ev?.id ?? null,
            descriptive: (ev?.descriptiveData as Record<string, unknown>) ?? {},
            affective: (ev?.affectiveData as Record<string, unknown>) ?? {},
            combined: (ev?.combinedData as Record<string, unknown>) ?? {},
            // Per-sample, owner-authored rows: never ship the maestro's
            // green-bean assessment to participants, and never ship reveal
            // data for a sample that is still blind (S4, 2026-09-08).
            physical: isOwner
              ? ((s.physical?.data as Record<string, unknown>) ?? {})
              : {},
            extrinsic:
              isOwner || s.revealed
                ? ((s.extrinsic?.data as Record<string, unknown>) ?? {})
                : {},
            revealed: s.revealed,
            coffeeId: s.coffeeId,
            coffee: isOwner
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
          };
        }),
      }}
      translations={{
        sample: t("cupping.sample"),
        ofTotal: t("cupping.ofTotal", { total: session.samples.length }),
        nextSample: t("cupping.nextSample"),
        nextPhase: t("cupping.nextPhase"),
        viewResults: t("cupping.viewResults"),
        submitting: t("cupping.submitting"),
        submitFailed: t("cupping.submitFailed"),
        retrySubmit: t("cupping.retrySubmit"),
        savedLocally: t("cupping.savedLocally"),
        prev: t("cupping.prev"),
        extrinsic: t("session.modules.extrinsic"),
        physical: t("session.modules.physical"),
        results: t("session.results"),
        process: t("actions.process"),
        editSample: t("session.editSample"),
        editSampleError: t("session.editSampleError"),
        editSampleNotOwner: t("session.editSampleNotOwner"),
        coffeeName: t("session.coffeeName"),
        coffeeCountry: tc("country"),
        coffeeRegion: tc("region"),
        coffeeFarm: tc("farm"),
        producerRoaster: t("session.producerRoaster"),
        coffeeVariety: tc("variety"),
        coffeeProcess: tc("process"),
        coffeeAltitude: tc("altitude"),
        coffeeRoastLevel: tc("roastLevel"),
        save: ta("save"),
        saving: ta("saving"),
        cancel: ta("cancel"),
        individual: t("score.individual"),
        masterControls: tg("masterControls"),
        submittedOf: tg("submittedOf", { count: submittedParticipantsResult.length, total: session.participants.length }),
        closeSession: tg("closeSession"),
        confirmClose: tg("confirmClose"),
        liveCountDown: tg("liveCountDown"),
        closeSessionError: tg("closeSessionError"),
        startSession: tg("startSession"),
        starting: tg("starting"),
        startSessionError: tg("startSessionError"),
        masterRole: tg("masterRole"),
        participantRole: tg("participantRole"),
        referenceSelect: tg("referenceSelect"),
        referenceNone: tg("referenceNone"),
        referenceBadge: t("cupping.referenceBadge"),
        // `{label}` is an ICU arg — fetched raw and replaced client-side.
        compareHint: t.raw("cupping.compareHint") as string,
        referenceLocked: t("cupping.referenceLocked"),
        referenceLockedAffective: t("cupping.referenceLockedAffective"),
        referenceCupsLocked: t("cupping.referenceCupsLocked"),
        // Shell (Phase 3)
        samplesHeader: t("cupping.shell.samplesHeader"),
        evaluationHeader: t("cupping.shell.evaluationHeader"),
        phaseTitle: t("cupping.shell.phaseTitle"),
        cuppingModule: t("cupping.shell.cuppingModule"),
        exitToSessions: t("cupping.shell.exitToSessions"),
        invite: t("cupping.shell.invite"),
        generating: t("cupping.shell.generating"),
        copy: t("cupping.shell.copy"),
        copied: t("cupping.shell.copied"),
        copyImage: t("cupping.shell.copyImage"),
        downloadQr: t("cupping.shell.downloadQr"),
        formatLabel: t(`session.formats.${session.format}`),
        phaseLabels: {
          fragrance: t("cupping.phases.fragrance"),
          aroma: t("cupping.phases.aroma"),
          taste_aftertaste: t("cupping.phases.taste_aftertaste"),
          acidity_sweetness_mouthfeel: t("cupping.phases.acidity_sweetness_mouthfeel"),
          overall: t("cupping.phases.overall"),
        },
        attrLabels: {
          fragancia_af: t("attributes.fragancia_af"),
          aroma_af: t("attributes.aroma_af"),
          sabor_af: t("attributes.sabor_af"),
          sabor_residual_af: t("attributes.sabor_residual_af"),
          acidez_af: t("attributes.acidez_af"),
          dulzor_af: t("attributes.dulzor_af"),
          sensacion_af: t("attributes.sensacion_af"),
          impresion_global: t("attributes.impresion_global"),
          gustos: t("attributes.gustos"),
        },
        guard: {
          nextTitle: t("cupping.guard.nextTitle"),
          nextBody: t("cupping.guard.nextBody"),
          submitTitle: t("cupping.guard.submitTitle"),
          submitBody: t("cupping.guard.submitBody"),
          review: t("cupping.guard.review"),
          continueAnyway: t("cupping.guard.continueAnyway"),
          submitAnyway: t("cupping.guard.submitAnyway"),
        },
        leaveGuard: {
          title: t("cupping.leaveGuard.title"),
          body: t("cupping.leaveGuard.body"),
          bodyPending: t("cupping.leaveGuard.bodyPending"),
          stay: t("cupping.leaveGuard.stay"),
          leave: t("cupping.leaveGuard.leave"),
        },
        offline: {
          bannerOffline: t("offline.bannerOffline"),
          bannerReconnecting: t("offline.bannerReconnecting"),
          bannerSynced: t("offline.bannerSynced"),
          bannerSyncFailed: t("offline.bannerSyncFailed"),
          retrySync: t("offline.retrySync"),
          submitBlocked: t("offline.submitBlocked"),
          conflictTitle: t("offline.conflictTitle"),
          // `{sample}` is filled client-side by SyncConflictModal (only the client
          // knows which sample conflicted) — pass the RAW template, not a formatted
          // string, otherwise next-intl errors on the missing ICU arg.
          conflictBody: t.raw("offline.conflictBody") as string,
          conflictKeep: t("offline.conflictKeep"),
          conflictReplace: t("offline.conflictReplace"),
          bannerStorageUnavailable: t("offline.bannerStorageUnavailable"),
        },
      }}
    />
  );
}
