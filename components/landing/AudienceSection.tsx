import { getTranslations } from "next-intl/server";
import PhotoSlot from "./PhotoSlot";
import CarouselControls, { CarouselSteps } from "./CarouselControls";
import SectionHeading from "./SectionHeading";
import { AUDIENCE_CARDS, AUDIENCE_PHOTOS } from "./audienceCards";

const LIST_ID = "para-quien-es";

/**
 * "Para quién es": five people cards, one per audience, starting with the
 * teachers. Each card is a PHOTO surface with a GLASS caption that overlaps
 * the lower part of the picture, so the photo shows through the top of the
 * panel and the constellation through the rest.
 *
 * These are not testimonials: no names, no quotes. The photos are real
 * sessions of the method (the shared caption says so); which photo stands
 * for which audience is set in ./audienceCards.ts.
 *
 * A real <ul> with CSS scroll-snap at every width: it scrolls by touch,
 * wheel and keyboard with no script. From 768px three cards show and
 * CarouselControls adds the arrows; on a phone one card shows with the next
 * one peeking in, and CarouselSteps adds the numbered steps under the list.
 * (For a day in 2026-11 the phone had a pinned scroll stage here; the owner
 * chose the sideways row: these cards are optional reading, and a reader who
 * does not want them scrolls straight past.)
 */
export default async function AudienceSection() {
  const t = await getTranslations("landing.audience");

  const cards = AUDIENCE_CARDS.map((card, i) => {
    const n = (i + 1) as 1 | 2 | 3 | 4 | 5;
    return {
      n: `0${n}`,
      title: t(`card${n}Title`),
      desc: t(`card${n}Desc`),
      src: AUDIENCE_PHOTOS[card.photo],
      alt: t(`photo${card.photo}Alt`),
      position: card.position,
    };
  });

  return (
    <section className="cv-auto relative z-10 bg-transparent">
      <div className="stage-section mx-auto max-w-6xl">
        <div className="stage-section-head px-5 sm:px-8">
          <SectionHeading
            eyebrow={t("eyebrow")}
            title={t("title")}
            assertion={t("titleAssertion")}
          >
            <CarouselControls
              listId={LIST_ID}
              total={cards.length}
              labels={{ prev: t("carouselPrev"), next: t("carouselNext") }}
            />
          </SectionHeading>
        </div>

        {/* tabIndex: Safari does not focus a scroll container on its own. */}
        <ul
          id={LIST_ID}
          tabIndex={0}
          aria-label={t("carouselLabel")}
          className="flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 pt-1 md:pb-8 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-fixed sm:scroll-px-8 sm:px-8 [&::-webkit-scrollbar]:hidden"
        >
          {cards.map((card) => (
            <li
              key={card.n}
              className="flex w-[82vw] max-w-[320px] shrink-0 snap-start flex-col md:w-[calc((100%-2rem)/3)] md:max-w-none"
            >
              <PhotoSlot
                src={card.src}
                alt={card.alt}
                aspect="4/5"
                position={card.position}
                sizes="(min-width: 768px) 320px, 82vw"
                className="audience-photo"
              />
              {/* A sibling of the photo frame, pulled up over it: the grain
                  stays on the picture and off the text. */}
              <div className="surface-glass-ink relative z-10 mx-3 -mt-24 flex flex-1 flex-col rounded-md p-5">
                <p className="font-serif tabular-nums text-sm text-secondary-container">
                  {card.n}
                </p>
                <h3 className="pt-1 font-serif text-2xl leading-tight text-surface">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-surface/85">
                  {card.desc}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <CarouselSteps listId={LIST_ID} total={cards.length} />

        <p className="mt-4 px-5 text-center text-xs text-surface/60 sm:px-8 md:mt-0 md:text-left">
          {t("galleryCaption")}
        </p>
      </div>
    </section>
  );
}
