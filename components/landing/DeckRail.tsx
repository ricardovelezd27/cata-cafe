import { Fragment } from "react";

/**
 * The progress rail of a phone scroll stage: one dot per card, joined by
 * lines. Hidden unless the stage is on; ScrollDeck lights the dots that are
 * reached and fills the lines (`.deck-rail*` in app/globals.css).
 * Decorative: every card is in the page and read in order without it.
 */
export default function DeckRail({ count }: { count: number }) {
  return (
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
    </div>
  );
}
