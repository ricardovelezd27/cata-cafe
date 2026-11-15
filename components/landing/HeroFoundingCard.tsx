import { getTranslations } from "next-intl/server";
import ScrollToLink from "./ScrollToLink";
import { FOUNDING_SEATS } from "@/lib/landing/founding";
import { FOUNDING_ID } from "./anchors";

// The hero's offer: the one solid cream card on the dark stage. It is a
// TOKEN of the offer, not a form: the number, what it is, and one button
// that takes the reader to the founding card further down, where the page's
// single reservation form lives (DESIGN.md "An ask appears once"). Until
// 2026-11-15 this card carried the form, four feature lines and a note, and
// the first screen read as a wall of text.
export default async function HeroFoundingCard() {
  const t = await getTranslations("landing.founding");
  const th = await getTranslations("landing.hero");

  // Three layers: a glass plate set back and offset (the constellation shows
  // through it), the solid cream card, and the terracotta tab riding its top
  // edge.
  return (
    <div className="relative mr-3 sm:mr-4">
      <div
        aria-hidden="true"
        className="surface-glass absolute inset-0 translate-x-3 translate-y-3 rounded-lg sm:translate-x-4 sm:translate-y-4"
      />
      <div className="surface-solid relative rounded-lg px-6 pb-6 pt-9 sm:px-8 sm:pb-8 sm:pt-10">
        <span className="absolute left-6 top-0 -translate-y-1/2 rounded-full bg-secondary-container px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-primary shadow-card-lg sm:left-8">
          {t("badge")}
        </span>

        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
          {t("heroLead")}
        </p>
        {/* No count-up: an offer number must never show a wrong value.
            Between 768 and 1023px the card is half a tablet wide: the numeral
            follows the width (11vw) so the unit stays beside it, as on a
            desktop. */}
        <p className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 sm:gap-x-4 md:max-lg:gap-x-3">
          <span className="font-serif tabular-nums text-hero-numeral leading-[0.9] tracking-[-0.04em] text-primary md:max-lg:text-[11vw]">
            {FOUNDING_SEATS}
          </span>
          <span className="max-w-[9ch] pb-2 font-serif text-xl leading-[1.05] text-on-surface sm:pb-4 sm:text-2xl md:max-lg:pb-2 md:max-lg:text-xl">
            {t("heroUnit")}
          </span>
        </p>

        <ScrollToLink
          targetId={FOUNDING_ID}
          focus="input[type=email]"
          className="mt-6 flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-primary-container px-4 text-sm font-semibold text-white transition-colors hover:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container"
        >
          {th("cta")}
        </ScrollToLink>
        <p className="mt-3 text-center text-sm text-on-surface-variant">{th("ctaNote")}</p>
      </div>
    </div>
  );
}
