import { notFound, redirect } from "next/navigation";
import { referencesOf } from "@/lib/referenceRules";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { WaitingRoomClient } from "./WaitingRoomClient";
import { warmupPlayerStrings } from "@/components/warmup/playerStrings";

export const dynamic = "force-dynamic";

export default async function WaitingPage({
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
      participants: { some: { userId: user.id } },
    },
    select: {
      id: true,
      name: true,
      startedAt: true,
      createdBy: true,
      date: true,
      isAsync: true,
      status: true,
      referenceSampleId: true,
      warmupExerciseId: true,
      samples: {
        select: { id: true, label: true, referenceRank: true },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!session) notFound();

  // Owner should never be in the waiting room
  if (session.createdBy === user.id) {
    redirect(`/${locale}/app/sessions/${id}/cup`);
  }

  // A closed session has nothing left to wait for — send everyone to results.
  if (session.status === "closed") {
    redirect(`/${locale}/app/sessions/${id}/results`);
  }

  const isAsyncMode = session.isAsync;

  // If already started (live session), go straight to cup
  if (!isAsyncMode && session.startedAt) {
    redirect(`/${locale}/app/sessions/${id}/cup`);
  }

  const t = await getTranslations("waiting");
  const tw = await getTranslations("warmup");

  return (
    <WaitingRoomClient
      sessionId={session.id}
      sessionName={session.name}
      locale={locale}
      userId={user.id}
      isAsync={isAsyncMode}
      samples={session.samples}
      warmup={{
        chosenId: session.warmupExerciseId,
        title: tw("waiting.title"),
        body: tw("waiting.body"),
        minutes: tw.raw("waiting.minutes") as string,
        hero: tw("waiting.hero"),
        heroStart: tw("waiting.heroStart"),
        heroDone: tw("waiting.heroDone"),
        heroRepeat: tw("waiting.heroRepeat"),
        others: tw("waiting.others"),
        startedTitle: tw("waiting.startedTitle"),
        leavingIn: tw.raw("waiting.leavingIn") as string,
        eyesClosed: tw("waiting.eyesClosed"),
        strings: warmupPlayerStrings(tw),
      }}
      initialReferenceIds={(() => {
        const ranked = referencesOf(session.samples).map((x) => x.id);
        return ranked.length ? ranked : session.referenceSampleId ? [session.referenceSampleId] : [];
      })()}
      translations={{
        // `{label}` is an ICU arg — fetched raw and replaced client-side.
        referenceLine: t.raw("referenceLine") as string,
        referencesLine: t.raw("referencesLine") as string,
        title: isAsyncMode ? t("titleAsync") : t("title"),
        description: isAsyncMode ? t("descriptionAsync") : t("description"),
        asyncDetail: t("asyncDetail"),
        waiting: t("waiting"),
        buttonLabel: t("buttonLabel"),
        checkingLabel: t("checkingLabel"),
        notStartedMsg: t("notStartedMsg"),
        backToSessions: t("backToSessions"),
        connectionLost: t("connectionLost"),
      }}
    />
  );
}
