import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { warmupById } from "@/lib/warmup/exercises";
import { warmupPlayerStrings } from "@/components/warmup/playerStrings";
import { WaitingRoomClient } from "@/app/[locale]/app/sessions/[id]/waiting/WaitingRoomClient";

// Dev-only: the waiting room's "Mientras esperas" card with a chosen exercise,
// outside a real session (async mode → no realtime channel). The seen-set uses
// the fake session id below. /app/warmup/dev-waiting?ex=<id>   (404 in production)
export const dynamic = "force-dynamic";

export default async function DevWaitingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ex?: string; session?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const chosen = warmupById(sp.ex ?? "eyes");
  const t = await getTranslations("waiting");
  const tw = await getTranslations("warmup");
  return (
    <WaitingRoomClient
      sessionId={sp.session ?? "dev-waiting"}
      sessionName="[DEV] Sala de espera"
      locale={locale}
      userId="dev-user"
      isAsync
      samples={[{ id: "s1", label: "Muestra A" }]}
      initialReferenceIds={[]}
      warmup={{
        chosenId: chosen?.id ?? null,
        warmupStartedAt: null,
        serverNow: new Date().toISOString(),
        synced: {
          listen: tw("synced.listen"),
          stopped: tw("synced.stopped"),
          soundToggle: tw("synced.soundToggle"),
          missed: tw("synced.missed"),
          inProgress: tw.raw("synced.inProgress") as string,
          join: tw("synced.join"),
        },
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
      translations={{
        referenceLine: t.raw("referenceLine") as string,
        referencesLine: t.raw("referencesLine") as string,
        title: t("titleAsync"),
        description: t("descriptionAsync"),
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
