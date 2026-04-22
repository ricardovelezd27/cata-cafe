import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { CupClient } from "./CupClient";

export default async function CupPage({
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

  const t = await getTranslations();
  const tg = await getTranslations("group");

  return (
    <CupClient
      locale={locale}
      isOwner={isOwner}
      isGroup={session.isGroup}
      userEmail={user.email ?? undefined}
      sessionStatus={session.status}
      participantCount={session.participants.length}
      submittedCount={submittedParticipantsResult.length}
      session={{
        id: session.id,
        name: session.name,
        format: session.format,
        cupsPerSample: session.cupsPerSample,
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
          };
        }),
      }}
      translations={{
        sample: t("cupping.sample"),
        ofTotal: t("cupping.ofTotal", { total: session.samples.length }),
        next: t("cupping.next"),
        prev: t("cupping.prev"),
        extrinsic: t("session.modules.extrinsic"),
        physical: t("session.modules.physical"),
        results: t("session.results"),
        process: t("actions.process"),
        individual: t("score.individual"),
        submitEval: tg("submitEval"),
        evalSubmitted: tg("evalSubmitted"),
        masterControls: tg("masterControls"),
        submittedOf: tg("submittedOf", { count: submittedParticipantsResult.length, total: session.participants.length }),
        closeSession: tg("closeSession"),
        confirmClose: tg("confirmClose"),
        reveal: tg("reveal"),
        selectCoffee: tg("selectCoffee"),
        masterRole: tg("masterRole"),
        participantRole: tg("participantRole"),
      }}
    />
  );
}
