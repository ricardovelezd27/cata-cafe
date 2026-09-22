import { getTranslations } from "next-intl/server";
import HeroFoundingCard from "./HeroFoundingCard";

export default async function HeroSection({ locale }: { locale: string }) {
  const t = await getTranslations("landing.hero");

  return (
    <section data-fold="0" className="relative z-10 overflow-hidden bg-transparent text-surface">
      {/* Terroir contour lines, drawn in on load (CSS, LCP-safe) */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.09]"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <g fill="none" stroke="#c7ebd4" strokeWidth="1.5">
          <path className="contour-path" pathLength={1} d="M-50 620 C 200 540, 380 700, 640 600 S 1050 520, 1280 610" />
          <path className="contour-path" pathLength={1} d="M-50 560 C 220 480, 400 640, 660 540 S 1060 460, 1280 550" />
          <path className="contour-path" pathLength={1} d="M-50 500 C 240 420, 420 580, 680 480 S 1070 400, 1280 490" />
          <path className="contour-path" pathLength={1} d="M-50 440 C 260 360, 440 520, 700 420 S 1080 340, 1280 430" />
          <path className="contour-path" pathLength={1} d="M-50 200 C 300 130, 500 260, 760 170 S 1090 90, 1280 180" />
          <path className="contour-path" pathLength={1} d="M-50 140 C 320 70, 520 200, 780 110 S 1100 30, 1280 120" />
        </g>
      </svg>

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-9 px-5 pb-16 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-2 lg:gap-14 lg:pb-24">
        <div className="lg:self-center">
          <p className="hero-rise text-[11px] font-semibold uppercase tracking-[0.22em] text-green-light">
            {t("eyebrow")}
          </p>
          {/* pt-, not mt-: the global heading reset in globals.css zeroes heading margins. */}
          <h1 className="hero-slide pt-6 font-serif text-4xl leading-[1.08] text-surface sm:text-5xl lg:text-6xl">
            {t("title")}
          </h1>
          {/* Transform-only entrance: the subtitle is now the largest text block
              on mobile (LCP candidate), so it must never start at opacity 0. */}
          <p className="hero-slide mt-6 max-w-xl text-base leading-relaxed text-surface/80 sm:text-lg">
            {t("subtitle")}
          </p>
        </div>

        {/* The founding card is the hero's only ask; no competing button. */}
        <div className="hero-slide lg:self-center">
          <HeroFoundingCard locale={locale} />
        </div>
      </div>
    </section>
  );
}
