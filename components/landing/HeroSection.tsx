import { getTranslations } from "next-intl/server";
import { ClipboardCheck, FileText, Users, WifiOff } from "lucide-react";
import HeroFoundingCard from "./HeroFoundingCard";

// What the product gives, as four things to see at a glance (an icon and two
// or three words each). The sentences that explain them are further down the
// page (DESIGN.md "A first screen has a word budget").
const CHIPS = [
  { key: "chip1", Icon: Users },
  { key: "chip2", Icon: ClipboardCheck },
  { key: "chip3", Icon: WifiOff },
  { key: "chip4", Icon: FileText },
] as const;

export default async function HeroSection() {
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
        <g fill="none" className="stroke-primary-fixed" strokeWidth="1.5">
          <path className="contour-path" pathLength={1} d="M-50 620 C 200 540, 380 700, 640 600 S 1050 520, 1280 610" />
          <path className="contour-path" pathLength={1} d="M-50 560 C 220 480, 400 640, 660 540 S 1060 460, 1280 550" />
          <path className="contour-path" pathLength={1} d="M-50 500 C 240 420, 420 580, 680 480 S 1070 400, 1280 490" />
          <path className="contour-path" pathLength={1} d="M-50 440 C 260 360, 440 520, 700 420 S 1080 340, 1280 430" />
          <path className="contour-path" pathLength={1} d="M-50 200 C 300 130, 500 260, 760 170 S 1090 90, 1280 180" />
          <path className="contour-path" pathLength={1} d="M-50 140 C 320 70, 520 200, 780 110 S 1100 30, 1280 120" />
        </g>
      </svg>

      {/* Warm light behind the offer card: the one terracotta glow on the page. */}
      <span
        aria-hidden="true"
        className="stage-light stage-light-terra left-1/2 top-[38%] h-[560px] w-[560px] -translate-x-1/2 md:left-auto md:right-[2%] md:top-1/2 md:h-[760px] md:w-[760px] md:-translate-y-1/2 md:translate-x-0"
      />

      {/* One message, four things at a glance, one offer with one button. */}
      <div className="stage-section relative mx-auto grid max-w-6xl grid-cols-1 gap-9 px-5 sm:px-8 md:grid-cols-2 md:gap-10 lg:gap-14">
        <div className="md:self-center">
          <p className="hero-rise text-[11px] font-semibold uppercase tracking-[0.22em] text-green-light">
            {t("eyebrow")}
          </p>
          {/* pt-, not mt-: the global heading reset in globals.css zeroes heading margins. */}
          <h1 className="hero-slide pt-4 font-serif text-4xl leading-[1.08] text-surface sm:pt-6 sm:text-5xl lg:text-6xl">
            {t("title")}
          </h1>
          {/* Transform-only entrance: the subtitle is now the largest text block
              on mobile (LCP candidate), so it must never start at opacity 0. */}
          <p className="hero-slide mt-4 max-w-xl text-base leading-relaxed text-surface/80 sm:mt-5 sm:text-lg">
            {t("subtitle")}
          </p>
          <ul className="hero-slide mt-6 flex flex-wrap gap-x-5 gap-y-3 sm:mt-7">
            {CHIPS.map(({ key, Icon }) => (
              <li key={key} className="flex items-center gap-2 text-sm font-medium text-surface/90">
                <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-primary-fixed" />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>

        {/* The offer card is the hero's only ask; its button goes to the form. */}
        {/* Two columns from 768px: a tablet is laid out as a desktop. */}
        <div className="hero-slide w-full max-w-[480px] md:max-w-none md:self-center">
          <HeroFoundingCard />
        </div>
      </div>
    </section>
  );
}
