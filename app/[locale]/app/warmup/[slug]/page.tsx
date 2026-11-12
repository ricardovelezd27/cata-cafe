import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { warmupBySlug } from "@/lib/warmup/exercises";
import { warmupPlayerStrings } from "@/components/warmup/playerStrings";
import { requireAppUser } from "@/lib/auth";
import { isRegisteredUser } from "@/lib/guestScope";
import { getWarmupReflections } from "@/lib/warmup/reflectionsData";
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
  const user = await requireAppUser(locale, `/${locale}/app/warmup/${slug}`);
  const t = await getTranslations("warmup");

  // Private reflections (S10 WP7, Kim F2): only the signed-in person's own
  // rows, read through the one helper that takes the user id. Guests cannot
  // reach this page (proxy.ts) and never save.
  const canSave = isRegisteredUser(user);
  const reflections = canSave ? await getWarmupReflections(user.id, exercise.id) : [];

  return (
    <WarmupExerciseRoute
      exerciseId={exercise.id}
      locale={locale}
      strings={warmupPlayerStrings(t)}
      backLabel={t("library.back")}
      listHref={`/${locale}/app/warmup`}
      canSaveReflections={canSave}
      reflections={reflections}
      reflectionStrings={{
        title: t("reflections.title"),
        private: t("reflections.private"),
        empty: t("reflections.empty"),
        delete: t("reflections.delete"),
        deleteTitle: t("reflections.deleteTitle"),
        deleteBody: t("reflections.deleteBody"),
        deleteConfirm: t("reflections.deleteConfirm"),
        deleteCancel: t("reflections.deleteCancel"),
        deleteFailed: t("reflections.deleteFailed"),
      }}
    />
  );
}
