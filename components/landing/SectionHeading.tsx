import type { ReactNode } from "react";

/**
 * How every section of the stage opens: a hairline with the section's name
 * sitting on it (the fold line), then the title, one clear step larger than
 * anything inside the section.
 *
 * One alignment for every section and every width: CENTRED, the line running
 * out to both sides of the name. (Until 2026-11-15 it turned left from 640px
 * up; the owner chose centred everywhere.) There is no per-section choice on
 * purpose.
 *
 * The title tells a small story in two lines: the IDEA (`title`), then the
 * ASSERTION (`assertion`) under it. The idea says in plain words what the
 * section is ("Así funciona una cata."); the assertion is what we claim
 * about it ("Percibir, describir, alinear."). The break between the two is
 * fixed, at every width; a title with no assertion is one statement.
 *
 * A pool of the deepest green sits behind the text (`stage-light-shade`), so
 * the constellation never crosses the title while it travels between folds.
 *
 * `children` go with the title: centred under it on a phone, and from 640px
 * up at the right end of the title's own row (the people cards put their
 * arrows there), so they never add a row of their own under a centred title.
 */
export default function SectionHeading({
  eyebrow,
  title,
  assertion,
  children,
}: {
  eyebrow: string;
  /** The idea: what the section is about (in "Cómo funciona", the actions). */
  title: ReactNode;
  /** What we claim about it, always on its own line under the idea. */
  assertion?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="stage-light stage-light-shade -inset-y-16 left-1/2 w-[min(100%,820px)] -translate-x-1/2"
      />
      <div data-reveal className="relative">
        <p className="section-rule text-[12px] font-semibold uppercase tracking-[0.24em] text-secondary-container">
          <span>{eyebrow}</span>
        </p>
        <div className="relative flex flex-col items-center gap-4 pt-5 text-center sm:pt-6">
          {/* Idea, then assertion: two lines of one heading. The space between
              the spans keeps it one sentence for a screen reader or a copy. */}
          <h2 className="max-w-3xl text-balance font-serif text-4xl leading-[1.1] text-surface sm:text-5xl">
            <span className="block">{title}</span>
            {assertion ? (
              <>
                {" "}
                {/* Italic, so the two parts stay told apart on a small phone,
                    where the idea itself can wrap onto two lines. */}
                <span className="display-italic block">{assertion}</span>
              </>
            ) : null}
          </h2>
          {children ? <div className="sm:absolute sm:bottom-0 sm:right-0">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}
