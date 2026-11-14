import { Fragment, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import MockFrameCVA from "./mockframes/MockFrameCVA";
import MockFrameFlavorPills from "./mockframes/MockFrameFlavorPills";
import MockFrameScoreCard from "./mockframes/MockFrameScoreCard";
import DeckRail from "./DeckRail";
import ScrollDeck from "./ScrollDeck";
import SectionHeading from "./SectionHeading";
import StepsActiveObserver from "./StepsActiveObserver";

const STEPS = [1, 2, 3] as const;
type Step = (typeof STEPS)[number];

/** The pile and its texts (wide screens: StepsActiveObserver). */
const ROOT_ID = "como-funciona-pasos";
/** The whole section as a phone scroll stage (ScrollDeck). */
const DECK_ID = "como-funciona";

/** The 1-2-3 progress rail. `filled` = how many steps are done, this one included. */
function Rail({ filled }: { filled: number }) {
  return (
    <div className="steps-rail" aria-hidden="true">
      {STEPS.map((n) => (
        <Fragment key={n}>
          {n > 1 ? (
            <span className="steps-rail-line" data-rail={n} data-on={n <= filled ? "1" : undefined} />
          ) : null}
          <span className="steps-rail-dot" data-rail={n} data-on={n <= filled ? "1" : undefined} />
        </Fragment>
      ))}
    </div>
  );
}

/**
 * "Cómo funciona": Percibe, Nombra, Mide. The three app screens PILE UP as
 * the reader moves through the steps; nothing is ever replaced, and the last
 * screen on the pile is the score (three steps, one result).
 *
 *  - Wide screens: one pile stays put on the left and grows while the texts
 *    scroll normally on the right. The scroll is the timeline: a screen is
 *    in place when its step's title is in the middle of the viewport
 *    (`StepsActiveObserver` + `stepsProgress.ts` + `.steps-*` CSS).
 *  - Phones: the section is a scroll stage (`ScrollDeck` + `.deck-*` CSS).
 *    The header stays under the top bar, the rail advances, the text of the
 *    step being read replaces the previous one and the same pile grows
 *    under it.
 *  - Reduced motion, no script, a phone too short for the stage: each step
 *    is its text, then the pile as it stands at that step (the earlier
 *    screens show as labelled edges).
 *
 * Each step's <article> keeps its own `data-fold`, so the constellation still
 * goes bowls, wheel, track; the formations are drawn around the pile
 * (journey/formations.ts `deviceRect`). On the phone stage the articles sit
 * in one place, so the `.deck-fold` markers along the track take over.
 */
export default async function StepsShowcase({ locale }: { locale: string }) {
  const t = await getTranslations("landing.how");

  const tab = (n: Step) => `0${n} · ${t(`step${n}Kicker`)}`;

  const screen = (n: Step): ReactNode =>
    n === 1 ? (
      <MockFrameCVA ariaLabel={t("frame1Aria")} tab={tab(1)} />
    ) : n === 2 ? (
      <MockFrameFlavorPills ariaLabel={t("frame2Aria")} tab={tab(2)} />
    ) : (
      <MockFrameScoreCard ariaLabel={t("frame3Aria")} locale={locale} tab={tab(3)} />
    );

  return (
    <section
      id={DECK_ID}
      data-deck="pile"
      data-deck-min="250"
      className="relative z-10 bg-transparent"
    >
      <div className="deck-stage mx-auto max-w-6xl px-5 pb-8 pt-20 sm:px-8 sm:pb-12 sm:pt-32">
        <div className="deck-head mb-6 sm:mb-12">
          <SectionHeading
            eyebrow={t("eyebrow")}
            title={t("title")}
            assertion={t("titleAssertion")}
          />
        </div>
        <DeckRail count={STEPS.length} />

        <div id={ROOT_ID} className="steps-root" data-active="1">
          {/* The pile that stays put (wide screens, and the phone stage). */}
          <div className="steps-pile" data-deck-area="">
            <span
              aria-hidden="true"
              className="stage-light stage-light-mint left-1/2 top-1/2 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2"
            />
            <div className="steps-pile-stack">
              {STEPS.map((n) => (
                <div key={n} className="steps-card" data-card={n} data-deck-card="">
                  {screen(n)}
                </div>
              ))}
            </div>
            <div className="steps-pile-rail">
              <Rail filled={1} />
            </div>
          </div>

          <div className="steps-slides">
            {STEPS.map((n) => (
              <article key={n} data-step={n} data-fold={n} className="steps-article">
                <div data-reveal className="steps-copy">
                  <Rail filled={n} />
                  <p className="steps-kicker mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-fixed lg:mt-0">
                    {t(`step${n}Kicker`)}
                  </p>
                  <p className="steps-num mt-3 font-serif tabular-nums text-lg text-secondary-container">
                    0{n}
                  </p>
                  {/* One step below the section title (SectionHeading). */}
                  <h3 className="pt-1 font-serif text-3xl leading-tight text-surface sm:text-4xl">
                    {t(`step${n}Title`)}
                  </h3>
                  <p className="steps-desc mt-4 max-w-prose text-lg leading-relaxed text-surface/80">
                    {t(`step${n}Desc`)}
                  </p>
                </div>

                {/* The pile as it stands at this step: earlier screens are
                    only their labelled top edges (decorative), then this
                    step's screen in front. */}
                <div data-reveal className="steps-snapshot">
                  {/* The offsets live on an INNER element: ScrollFx clears
                      every inline style of a data-reveal element when its
                      reveal ends, which would drop this padding. */}
                  <div className="relative" style={{ paddingTop: (n - 1) * 30 }}>
                    {STEPS.filter((k) => k < n).map((k) => (
                      <div
                        key={k}
                        aria-hidden="true"
                        className="steps-strip"
                        style={{
                          top: (k - 1) * 30,
                          left: `${(n - k) * 4}%`,
                          right: `${(n - k) * 4}%`,
                        }}
                      >
                        {tab(k)}
                      </div>
                    ))}
                    <div className="relative">{screen(n)}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      {/* Phone stage only: where the constellation changes formation. */}
      {STEPS.map((n) => (
        <span key={n} aria-hidden="true" className="deck-fold" data-deck-fold={n} />
      ))}
      <StepsActiveObserver rootId={ROOT_ID} />
      <ScrollDeck rootId={DECK_ID} />
    </section>
  );
}
