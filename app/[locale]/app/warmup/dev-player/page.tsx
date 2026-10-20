import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WARMUP_EXERCISES, warmupById } from "@/lib/warmup/exercises";
import { warmupPlayerStrings } from "@/components/warmup/playerStrings";
import { DevPlayer } from "./DevPlayer";

// Dev-only: exercise the WarmupPlayer outside the session flow.
// /app/warmup/dev-player?ex=<id>&inline=1   (404 in production)
export const dynamic = "force-dynamic";

export default async function DevPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ex?: string; inline?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const exercise = warmupById(sp.ex) ?? WARMUP_EXERCISES[0];
  const t = await getTranslations("warmup");
  return (
    <DevPlayer
      exerciseId={exercise.id}
      locale={locale}
      inline={sp.inline === "1"}
      strings={warmupPlayerStrings(t)}
    />
  );
}
