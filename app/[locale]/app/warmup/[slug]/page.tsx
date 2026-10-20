import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { warmupBySlug } from "@/lib/warmup/exercises";
import { warmupPlayerStrings } from "@/components/warmup/playerStrings";
import { WarmupExerciseRoute } from "./WarmupExerciseRoute";

// Auth'd page with a dynamic [slug] segment: must render per-request. With
// generateStaticParams present, production attempts on-demand static
// generation and the cookies() call inside the app layout's Supabase client
// 500s (dev renders dynamic and hides it) — see CLAUDE.md "Locale-First
// Routing". Do NOT add generateStaticParams here.
export const dynamic = "force-dynamic";

export default async function WarmupExercisePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const exercise = warmupBySlug(slug);
  if (!exercise) notFound();
  const t = await getTranslations("warmup");

  return (
    <WarmupExerciseRoute
      exerciseId={exercise.id}
      locale={locale}
      strings={warmupPlayerStrings(t)}
      backLabel={t("library.back")}
      listHref={`/${locale}/app/warmup`}
    />
  );
}
