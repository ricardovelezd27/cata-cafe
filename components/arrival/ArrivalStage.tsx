import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/Wordmark";
import { localeHref } from "@/components/landing/locale-href";
import { LocaleSwitchLink } from "@/components/layout/LocaleSwitchLink";
import { LEGAL_PAGES_PUBLISHED } from "@/lib/legal/config";
import styles from "./ArrivalStage.module.css";

/**
 * The shell of every screen where a person ARRIVES (package S8, audit K-01):
 * sign-in, the emailed link's button page, the guest claim card, the session
 * join page and the coffee join page.
 *
 *   [stage ground]  wordmark ........................... English
 *            (one still pool of light behind the card)
 *            +--------------- solid cream card ---------------+
 *            | the one ask: a title, a sentence, a form or     |
 *            | one button                                      |
 *            +-------------------------------------------------+
 *      Privacidad · Términos · Aviso legal
 *
 * It is a SHELL: it decides nothing and holds no form. What the card contains
 * (which form, which action, which fields, every message) is the page's, and
 * is unchanged by this component.
 *
 * - The ground is the landing's dark green (`--color-stage` to
 *   `--color-stage-deep`), the mark is the landing's (`Wordmark`), and the card
 *   is the stage's one solid surface (`.surface-solid`): what must be read or
 *   acted on sits on the most opaque surface of the screen.
 * - No dots. A formation of the constellation needs the landing's engine to
 *   learn a still, unscrolled mode; until that package there is one static pool
 *   of light (CSS only), so nothing moves, nothing blocks the first paint and
 *   reduced motion needs no special case.
 * - `<main>` and the page's one `h1` (inside the card) live here.
 */
export async function ArrivalStage({
  locale,
  children,
  below,
}: {
  locale: string;
  /** The card's content. */
  children: ReactNode;
  /** A quiet line under the card, on the ground (rare). */
  below?: ReactNode;
}) {
  const loc = locale === "en" ? "en" : "es";
  const other = loc === "es" ? "en" : "es";
  const tLocale = await getTranslations("locale");
  const tLegal = await getTranslations("landing.footer");

  return (
    <div className={styles.ground} data-arrival-stage="">
      <div className={`stage-light stage-light-mint ${styles.light}`} aria-hidden="true" />
      <header className={styles.bar}>
        <Wordmark href={localeHref(loc, "/")} tone="stage" />
        {/* The same page in the other language: the path and the query are kept
            (a link's token is not consumed by a GET). Named in its own language. */}
        <LocaleSwitchLink locale={loc} className={styles.language}>
          <span lang={other}>{tLocale(other)}</span>
        </LocaleSwitchLink>
      </header>
      <main className={styles.main}>
        <div className={`surface-solid ${styles.card}`} data-arrival-card="">
          {children}
        </div>
        {below}
      </main>
      {/* F-landing-1: the legal pages are linked only once they are published. */}
      {LEGAL_PAGES_PUBLISHED ? (
        <footer className={styles.foot}>
          <Link href={localeHref(loc, "/privacidad")} className={styles.footLink}>
            {tLegal("privacy")}
          </Link>
          <Link href={localeHref(loc, "/terminos")} className={styles.footLink}>
            {tLegal("terms")}
          </Link>
          <Link href={localeHref(loc, "/aviso-legal")} className={styles.footLink}>
            {tLegal("legalNotice")}
          </Link>
        </footer>
      ) : null}
    </div>
  );
}
