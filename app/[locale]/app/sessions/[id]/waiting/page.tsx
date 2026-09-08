import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { WaitingRoomClient } from "./WaitingRoomClient";

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

  return (
    <WaitingRoomClient
      sessionId={session.id}
      sessionName={session.name}
      locale={locale}
      isAsync={isAsyncMode}
      translations={{
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
