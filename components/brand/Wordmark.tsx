import Link from "next/link";

/** The mark as it is written. It is a mark, not copy: the same in every language. */
export const WORDMARK = "cafesensible";
export const WORDMARK_SUFFIX = ".ai";

const TONE = {
  /** On the dark stage: cream, the suffix in the stage's terracotta. */
  stage: { text: "text-surface", suffix: "text-secondary-container" },
  /** On paper: the app's green, the suffix in the paper's terracotta. */
  paper: { text: "text-primary-container", suffix: "text-secondary" },
} as const;

/**
 * The product's mark (DESIGN.md "Brand mark"; audit K-05): ONE component, the
 * landing header's wordmark made shared. It links home and is used by the
 * landing header, the app shell (the sidebar and the phone's top bar) and every
 * arrival screen (`ArrivalStage`). A screen never writes the name by hand.
 *
 * `href` is the caller's "home": the landing for a visitor, the dashboard
 * inside the app. The link is a 44 px target; the suffix is decoration (the
 * mark is read as its name).
 */
export function Wordmark({
  href,
  tone = "paper",
  className = "",
}: {
  href: string;
  tone?: keyof typeof TONE;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <Link
      href={href}
      data-wordmark=""
      className={`inline-flex min-h-[44px] items-center font-serif text-card tracking-tight no-underline ${t.text} ${className}`}
    >
      {WORDMARK}
      <span aria-hidden="true" className={t.suffix}>
        {WORDMARK_SUFFIX}
      </span>
    </Link>
  );
}
