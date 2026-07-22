import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { CupClient } from "./CupClient";

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

  if (!session) notFound();

  const isOwner = session.createdBy === user.id;

  // Count submitted evaluations (non-draft) across all samples
  // Use aggregateScore.participantCount as a proxy if available,
  // otherwise fall back to a direct count.
  const submittedCountResult = await prisma.evaluation.count({
    where: {
      sessionSample: { sessionId: id },
      isDraft: false,
      cupperId: user.id,
    },
  });

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
      participantCount={session.participants.length}
      submittedCount={submittedParticipantsResult.length}
      session={{
        id: session.id,
        name: session.name,
        format: session.format,
        cupsPerSample: session.cupsPerSample,
        date: session.date.toISOString(),
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
            physical: (s.physical?.data as Record<string, unknown>) ?? {},
            extrinsic: (s.extrinsic?.data as Record<string, unknown>) ?? {},
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
        prev: t("cupping.prev"),
        extrinsic: t("session.modules.extrinsic"),
        physical: t("session.modules.physical"),
        results: t("session.results"),
        process: t("actions.process"),
        editSample: t("session.editSample"),
        editSampleError: t("session.editSampleError"),
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
        masterRole: tg("masterRole"),
        participantRole: tg("participantRole"),
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
        offline: {
          bannerOffline: t("offline.bannerOffline"),
          bannerReconnecting: t("offline.bannerReconnecting"),
          bannerSynced: t("offline.bannerSynced"),
          bannerSyncFailed: t("offline.bannerSyncFailed"),
          retrySync: t("offline.retrySync"),
          submitBlocked: t("offline.submitBlocked"),
          conflictTitle: t("offline.conflictTitle"),
          conflictBody: t("offline.conflictBody"),
          conflictKeep: t("offline.conflictKeep"),
          conflictReplace: t("offline.conflictReplace"),
        },
      }}
    />
  );
}
