import { Fragment } from "react";

/**
 * The progress rail of a phone scroll stage: one dot per card, joined by
 * lines, VERTICAL because the page scrolls down (it stands in the right
 * gutter and fills downward), with a chevron under the last dot for as long
 * as another card is still to come, plus the counter "02 / 06" with a
 * chevron at the bottom of the stage (the plain statement that the next card
 * is below). Hidden unless the stage is on;
 * ScrollDeck lights the dots that are reached, fills the lines and marks the
 * end (`.deck-rail*`, `.rail-more` in app/globals.css).
 * Decorative: every card is in the page and read in order without it.
 */
export default function DeckRail({ count }: { count: number }) {
  return (
    <>
    <div className="deck-rail" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Fragment key={i}>
          {i > 0 ? <span className="deck-rail-line" data-deck-line="" /> : null}
          <span
            className="deck-rail-dot"
            data-deck-dot=""
            data-on={i === 0 ? "1" : undefined}
          />
        </Fragment>
      ))}
      <span className="rail-more" />
    </div>
    {/* "2 / 6" and a chevron: ScrollDeck writes the first number. */}
    <p className="deck-more" aria-hidden="true">
      <span>
        <b data-deck-now="">01</b> / {String(count).padStart(2, "0")}
      </span>
      <span className="rail-more" />
    </p>
    </>
  );
}
