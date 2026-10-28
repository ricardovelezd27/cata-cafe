import Link from "next/link";
import { ChevronRight, EyeOff } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { WARMUP_EXERCISES, WARMUP_SHARED, lw } from "@/lib/warmup/exercises";
import { WarmupFigure } from "@/components/warmup/figures";
import { previewSpec } from "@/lib/warmup/preview";

// Library of Kim's five sensory warm-ups. Sole dynamic segment is [locale]
// → static params are fine here (the per-exercise page is NOT static).
export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function WarmupLibraryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("warmup");

  const shared = [WARMUP_SHARED.safety, WARMUP_SHARED.fifteenSeconds, WARMUP_SHARED.evolution];

  return (
    <div className="space-y-10 max-w-5xl">
      <PageHeader
        title={lw(WARMUP_SHARED.title, locale)}
        description={lw(WARMUP_SHARED.subtitle, locale)}
      />

      {/* Editorial lead: the method's three shared ideas, no cards. */}
      <section className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:gap-12">
        <p className="font-display text-xl leading-snug text-on-surface md:text-2xl">
          {lw(WARMUP_SHARED.intro, locale)}
        </p>
        <dl className="space-y-4 border-l-2 border-outline-variant pl-5">
          {shared.map((block) => (
            <div key={block.title.es}>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
                {lw(block.title, locale)}
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-on-surface">{lw(block.text, locale)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The five exercises — numbered editorial list with a static thumbnail. */}
      <section className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
          {t("library.listEyebrow")}
        </p>
        <ol className="divide-y divide-outline-variant border-y border-outline-variant">
          {WARMUP_EXERCISES.map((ex) => {
            return (
              <li key={ex.id}>
                <Link
                  href={`/${locale}/app/warmup/${ex.slug}`}
                  className="group grid grid-cols-[28px_72px_1fr_20px] items-center gap-3 py-4 transition-colors hover:bg-surface-container-low md:grid-cols-[32px_88px_1fr_20px] md:gap-5 md:py-5"
                >
                  <span
                    className="font-display text-[28px] leading-none text-primary-fixed-dim tabular-nums text-right md:text-[32px]"
                    aria-hidden
                  >
                    {ex.order}
                  </span>
                  <span className="relative block h-[72px] w-[72px] md:h-[88px] md:w-[88px]">
                    <span className="block h-full w-full overflow-hidden rounded-card" aria-hidden>
                      <WarmupFigure {...previewSpec(ex)} frame="tile" />
                    </span>
                    {ex.figureKind === "eyes" && (
                      <span className="absolute bottom-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full bg-surface/80">
                        <EyeOff size={12} aria-label={t("library.eyesClosed")} role="img" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-xl text-primary-container md:text-2xl">
                      {lw(ex.name, locale)}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-on-surface-variant line-clamp-2">
                      {lw(ex.purpose, locale)}
                    </span>
                    <span className="mt-2 block text-xs text-on-surface-variant tabular-nums">
                      {t("library.minutes", { min: ex.durationMin })} · {t("library.steps", { count: ex.steps.length })} ·{" "}
                      {lw(WARMUP_SHARED.posture[ex.posture], locale)}
                    </span>
                  </span>
                  <ChevronRight
                    size={18}
                    className="shrink-0 text-on-surface-variant transition-colors group-hover:text-primary-container"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <p className="text-xs text-on-surface-variant">
        {lw(WARMUP_SHARED.closing.text, locale)}{" "}
        <em>
          {lw(WARMUP_SHARED.closing.questions[0], locale)} {lw(WARMUP_SHARED.closing.questions[1], locale)}
        </em>
      </p>
    </div>
  );
}
