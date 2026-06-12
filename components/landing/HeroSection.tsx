import Link from "next/link";
import { getTranslations } from "next-intl/server";
import PriceBandWidget from "./PriceBandWidget";
import { loginHref } from "./locale-href";
import type { OriginKey, ProcessKey } from "./price-bands";

export default async function HeroSection({ locale }: { locale: string }) {
  const t = await getTranslations("landing.hero");
  const tw = await getTranslations("landing.widget");

  const origins = Object.fromEntries(
    (["etiopia", "kenia", "colombia", "centroamerica", "brasil", "otros"] as const).map(
      (k) => [k, tw(`origins.${k}`)],
    ),
  ) as Record<OriginKey, string>;
  const processes = Object.fromEntries(
    (["lavado", "natural", "honey", "fermentacion"] as const).map((k) => [
      k,
      tw(`processes.${k}`),
    ]),
  ) as Record<ProcessKey, string>;

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-green-dark text-surface">
      {/* Decorative contour lines — terroir topography */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <g fill="none" stroke="#c7ebd4" strokeWidth="1.5">
          <path d="M-50 620 C 200 540, 380 700, 640 600 S 1050 520, 1280 610" />
          <path d="M-50 560 C 220 480, 400 640, 660 540 S 1060 460, 1280 550" />
          <path d="M-50 500 C 240 420, 420 580, 680 480 S 1070 400, 1280 490" />
          <path d="M-50 440 C 260 360, 440 520, 700 420 S 1080 340, 1280 430" />
          <path d="M-50 200 C 300 130, 500 260, 760 170 S 1090 90, 1280 180" />
          <path d="M-50 140 C 320 70, 520 200, 780 110 S 1100 30, 1280 120" />
        </g>
      </svg>

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 pb-16 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-2 lg:gap-14 lg:pb-24">
        <div className="lg:self-center">
          <p className="hero-rise text-[11px] font-semibold uppercase tracking-[0.22em] text-green-light">
            {t("eyebrow")}
          </p>
          <h1 className="hero-slide mt-4 font-serif text-4xl leading-[1.08] text-surface sm:text-5xl lg:text-6xl">
            {t("title")}
          </h1>
          <p className="hero-rise hero-rise-2 mt-5 max-w-xl text-base leading-relaxed text-surface/80 sm:text-lg">
            {t("subtitle")}
          </p>
          <div className="hero-rise hero-rise-3 mt-8 hidden lg:block">
            <Link
              href={loginHref(locale)}
              className="inline-block rounded-full bg-surface px-7 py-3.5 text-base font-semibold text-primary shadow-lg transition-colors hover:bg-primary-fixed"
            >
              {t("cta")}
            </Link>
            <p className="mt-3 text-xs text-surface/75">{t("ctaNote")}</p>
          </div>
        </div>

        <div className="hero-slide lg:self-center">
          <PriceBandWidget
            locale={locale}
            labels={{
              title: tw("title"),
              scoreLabel: tw("scoreLabel"),
              scoreAria: tw("scoreAria", { score: "{score}" }),
              scorePoints: tw("scorePoints"),
              originLabel: tw("originLabel"),
              processLabel: tw("processLabel"),
              origins,
              processes,
              bandLabel: tw("bandLabel"),
              perKg: tw("perKg"),
              source: tw("source"),
              disclaimer: tw("disclaimer"),
            }}
          />
        </div>

        {/* Mobile CTA below the widget, per flow */}
        <div className="text-center lg:hidden">
          <Link
            href={loginHref(locale)}
            className="inline-block w-full rounded-full bg-surface px-7 py-3.5 text-base font-semibold text-primary shadow-lg transition-colors hover:bg-primary-fixed sm:w-auto"
          >
            {t("cta")}
          </Link>
          <p className="mt-3 text-xs text-surface/75">{t("ctaNote")}</p>
        </div>
      </div>
    </section>
  );
}
