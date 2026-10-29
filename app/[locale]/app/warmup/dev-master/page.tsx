import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DevMaster } from "./DevMaster";

// Dev-only: the master panel's synced warm-up block (MasterControls `warmup`
// prop) with fake handlers — start / running + time left / stop / reopen.
// /app/warmup/dev-master   (404 in production)
export const dynamic = "force-dynamic";

export default async function DevMasterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (process.env.NODE_ENV === "production") notFound();
  const tg = await getTranslations("group");
  const ta = await getTranslations("actions");
  return (
    <DevMaster
      strings={{
        title: tg("masterControls"),
        submitted: tg("submittedOf", { count: 0, total: 3 }),
        close: tg("closeSession"),
        invite: tg("inviteLink"),
        generating: tg("inviteLink"),
        copy: tg("copyLink"),
        copied: tg("copied"),
        copyImage: tg("copyImage"),
        downloadQr: tg("downloadQr"),
        start: tg("startSession"),
        starting: tg("starting"),
        warmupStart: tg("warmupStart"),
        warmupStop: tg("warmupStop"),
        warmupReopen: tg("warmupReopen"),
        warmupRunning: tg("warmupRunning"),
        warmupTimeLeft: tg.raw("warmupTimeLeft") as string,
        cancel: ta("cancel"),
      }}
    />
  );
}
