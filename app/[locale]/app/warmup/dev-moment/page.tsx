import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { warmupPlayerStrings } from "@/components/warmup/playerStrings";
import { DevMoment } from "./DevMoment";

// Dev-only: exercise the session-moment overlay (WarmupMoment) outside a
// real session — seen-set, skip, Escape, offline. 404 in production.
export const dynamic = "force-dynamic";

export default async function DevMomentPage({
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
  const t = await getTranslations("warmup");
  return (
    <DevMoment
      locale={locale}
      exerciseId={sp.ex ?? "head-rotate"}
      sessionId={sp.session ?? "dev-session"}
      strings={warmupPlayerStrings(t)}
    />
  );
}
