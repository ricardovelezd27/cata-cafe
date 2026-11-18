import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WaitingRoomClient } from "../sessions/[id]/waiting/WaitingRoomClient";
import { warmupPlayerStrings } from "@/components/warmup/playerStrings";

// Dev-only review board for the waiting room (package S7b, audit K-02). The
// real WaitingRoomClient with invented props, inside the app shell like the real
// page, because no test session can be waited in (the [DEV] group session has
// started, and nothing is created to get one). Outside `next dev` it is a 404.
// A live state subscribes to the realtime channel of an invented id: it gets no
// event, falls back to polling (`getWaitingState`, a read) and shows the
// "connection lost" line, exactly as the real page would with a dead socket.
export const dynamic = "force-dynamic";

const SAMPLES = ["A", "B", "C", "D", "E", "F"].map((l, i) => ({ id: `dev-sample-${i}`, label: `Muestra ${l}` }));

export default async function DevWaitingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { locale } = await params;
  const { state = "live" } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("waiting");
  const tw = await getTranslations("warmup");
  const isAsync = state === "async";
  const withWarmup = state === "warmup" || state === "running";
  const refs = state === "reference" ? ["dev-sample-2"] : state === "references" ? ["dev-sample-0", "dev-sample-3", "dev-sample-5"] : [];

  return (
    <WaitingRoomClient
      sessionId="00000000-0000-0000-0000-00000000dev0"
      sessionName="[DEV] Cata de prueba"
      locale={locale}
      userId="00000000-0000-0000-0000-00000000dev1"
      isAsync={isAsync}
      samples={SAMPLES}
      warmup={
        withWarmup || state === "live"
          ? {
              chosenId: withWarmup ? "arm-raise" : null,
              warmupStartedAt: state === "running" ? new Date(new Date().getTime() - 20_000).toISOString() : null,
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
            }
          : undefined
      }
      initialReferenceIds={refs}
      translations={{
        referenceLine: t.raw("referenceLine") as string,
        referencesLine: t.raw("referencesLine") as string,
        title: isAsync ? t("titleAsync") : t("title"),
        description: isAsync ? t("descriptionAsync") : t("description"),
        asyncDetail: t("asyncDetail"),
        waiting: t("waiting"),
        buttonLabel: t("buttonLabel"),
        backToSessions: t("backToSessions"),
        connectionLost: t("connectionLost"),
      }}
    />
  );
}
