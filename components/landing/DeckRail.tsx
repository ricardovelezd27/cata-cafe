import { Fragment } from "react";

/**
 * The progress rail of the phone scroll stage ("Cómo funciona"): one NUMBERED
 * step per screen, joined by lines, VERTICAL because the page scrolls down
 * (it stands at the left edge and fills downward), plus the counter "02 / 03"
 * with a chevron at the bottom of the stage (the plain statement that the
 * next screen is below). Hidden unless the stage is on; ScrollDeck lights the
 * steps that are reached, fills the lines and marks the end (`.rail-step`,
 * `.deck-rail*`, `.rail-more` in app/globals.css).
 * Decorative: every screen is in the page and read in order without it.
 */
export default function DeckRail({ count }: { count: number }) {
  return (
    <>
      <div className="deck-rail" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <Fragment key={i}>
            {i > 0 ? <span className="deck-rail-line" data-deck-line="" /> : null}
            <span className="rail-step" data-deck-dot="" data-on={i === 0 ? "1" : undefined}>
              {i + 1}
            </span>
          </Fragment>
        ))}
        <span className="rail-more" />
      </div>
      {/* "2 / 3" and a chevron: ScrollDeck writes the first number. */}
      <p className="deck-more" aria-hidden="true">
        <span>
          <b data-deck-now="">01</b> / {String(count).padStart(2, "0")}
        </span>
        <span className="rail-more" />
      </p>
    </>
  );
}
