import { getTranslations } from "next-intl/server";
import PhotoSlot from "./PhotoSlot";
import CarouselControls from "./CarouselControls";
import DeckRail from "./DeckRail";
import ScrollDeck from "./ScrollDeck";
import SectionHeading from "./SectionHeading";
import { AUDIENCE_CARDS, AUDIENCE_PHOTOS } from "./audienceCards";

const LIST_ID = "para-quien-es";
const DECK_ID = "para-quien-es-seccion";

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
 * A real <ul> with CSS scroll-snap: it scrolls by touch, wheel and keyboard
 * with no script. CarouselControls only adds the counter and the arrows.
 *
 * On a phone the section is a scroll stage instead (`ScrollDeck`, `.deck-*`
 * CSS), the same way of moving as the two sections before it: the header
 * stays under the top bar and the vertical scroll brings the five cards one
 * at a time. No sideways swipe to learn; the swipe list remains the layout
 * when the stage is off (reduced motion, no script, a very short phone).
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
    <section
      id={DECK_ID}
      data-deck="fill"
      data-deck-min="330"
      className="cv-auto relative z-10 bg-transparent"
    >
      <div className="deck-stage mx-auto max-w-6xl py-20 sm:py-24">
        <div className="px-5 sm:px-8">
          <div className="deck-head">
            <SectionHeading
              eyebrow={t("eyebrow")}
              title={t("title")}
              assertion={t("titleAssertion")}
            >
              <div className="deck-hide">
                <CarouselControls
                  listId={LIST_ID}
                  total={cards.length}
                  labels={{ prev: t("carouselPrev"), next: t("carouselNext") }}
                />
              </div>
            </SectionHeading>
          </div>
          <DeckRail count={cards.length} />
        </div>

        {/* tabIndex: Safari does not focus a scroll container on its own. */}
        <ul
          id={LIST_ID}
          tabIndex={0}
          aria-label={t("carouselLabel")}
          data-deck-area=""
          className="deck-cards deck-over deck-fill mt-10 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-8 pt-1 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-fixed sm:scroll-px-8 sm:px-8 [&::-webkit-scrollbar]:hidden"
        >
          {cards.map((card) => (
            <li
              key={card.n}
              data-deck-card=""
              className="deck-card flex w-[82vw] max-w-[320px] shrink-0 snap-start flex-col lg:w-[calc((100%-2rem)/3)] lg:max-w-none"
            >
              <PhotoSlot
                src={card.src}
                alt={card.alt}
                aspect="4/5"
                position={card.position}
                sizes="(min-width: 1024px) 320px, (min-width: 640px) 320px, 92vw"
                className="deck-photo"
              />
              {/* A sibling of the photo frame, pulled up over it: the grain
                  stays on the picture and off the text. */}
              <div className="deck-caption surface-glass-ink relative z-10 mx-3 -mt-24 flex flex-1 flex-col rounded-md p-5">
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

        <p className="deck-note px-5 text-xs text-surface/60 sm:px-8">
          {t("galleryCaption")}
        </p>
      </div>
      <ScrollDeck rootId={DECK_ID} />
    </section>
  );
}
