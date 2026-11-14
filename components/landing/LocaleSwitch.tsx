"use client";

import { useLayoutEffect, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { anchorScrollTop, pickAnchor, type ScrollAnchor } from "./scrollAnchor";

const LOCALES = [
  { code: "es", href: "/" },
  { code: "en", href: "/en" },
] as const;

type Code = (typeof LOCALES)[number]["code"];

/**
 * The place to return to after the switch is kept in sessionStorage, not in
 * a ref: Next keys everything under `[locale]` by the locale, so the whole
 * page, this component included, is mounted anew in the other language.
 */
const ANCHOR_KEY = "cs_locale_anchor";

function saveAnchor(anchor: ScrollAnchor | null) {
  try {
    if (anchor) window.sessionStorage.setItem(ANCHOR_KEY, JSON.stringify(anchor));
    else window.sessionStorage.removeItem(ANCHOR_KEY);
  } catch {
    // Storage blocked: the switch still works, the place is simply not kept.
  }
}

/** Reads the saved place once: it is removed as it is read. */
function takeAnchor(): ScrollAnchor | null {
  try {
    const raw = window.sessionStorage.getItem(ANCHOR_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(ANCHOR_KEY);
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { index, ratio } = value as Record<string, unknown>;
    if (typeof index !== "number" || typeof ratio !== "number") return null;
    if (!Number.isInteger(index) || index < 0 || !Number.isFinite(ratio)) return null;
    return { index, ratio };
  } catch {
    return null;
  }
}

function pageSections(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("main > section"));
}

/**
 * The ES / EN pills of the landing header. Switching language keeps the
 * reader where they are: the document is not reloaded, and the scroll is put
 * back on the same section, the same share of the way through it (the text
 * is not the same length in both languages, so the same pixel would not do).
 *
 * They are real links: without script, or with a modifier key (new tab), the
 * browser follows them as usual. The anchor is the 44px touch target; the
 * inner chip is the look.
 *
 * `<html lang>` is set here as well: the inline script that sets it
 * (app/layout.tsx) only runs on a full page load.
 */
export default function LocaleSwitch({
  locale,
  labels,
}: {
  locale: string;
  labels: Record<Code, string>;
}) {
  const router = useRouter();

  // Runs when the page has been mounted in the new language, before the
  // browser paints it.
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    const anchor = takeAnchor();
    if (!anchor) return;
    // The header's effects run before the sections' (ScrollDeck turns the
    // phone stages on in its own layout effect, which changes the heights).
    // A microtask runs after every layout effect of this commit and still
    // before the paint.
    queueMicrotask(() => {
      const section = pageSections()[anchor.index];
      if (!section) return;
      // Sections with `.cv-auto` have a placeholder height until they are
      // first drawn, and the page was just mounted anew: measure with every
      // section laid out, then let them go back to skipping off-screen work
      // (they remember their real size from then on).
      const root = document.documentElement;
      root.setAttribute("data-cv-visible", "");
      const rect = section.getBoundingClientRect();
      window.scrollTo({
        top: anchorScrollTop(rect.top + window.scrollY, rect.height, anchor.ratio),
        behavior: "instant",
      });
      requestAnimationFrame(() =>
        requestAnimationFrame(() => root.removeAttribute("data-cv-visible")),
      );
    });
  }, [locale]);

  const onClick = (event: MouseEvent<HTMLAnchorElement>, code: Code, href: string) => {
    // A new tab, a new window, a download: the browser's business.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    if (code === locale) return;
    saveAnchor(
      pickAnchor(
        pageSections().map((el) => {
          const rect = el.getBoundingClientRect();
          return { top: rect.top, height: rect.height };
        }),
      ),
    );
    router.push(href, { scroll: false });
  };

  return (
    <div className="flex items-center text-xs font-medium">
      {LOCALES.map(({ code, href }) => (
        <a
          key={code}
          href={href}
          hrefLang={code}
          aria-label={labels[code]}
          aria-current={locale === code ? "true" : undefined}
          onClick={(event) => onClick(event, code, href)}
          className="group inline-flex min-h-[44px] min-w-[44px] items-center justify-center"
        >
          <span
            className={
              locale === code
                ? "rounded-full bg-surface px-2.5 py-1 text-primary"
                : "rounded-full px-2.5 py-1 text-surface/70 group-hover:text-surface"
            }
          >
            {code.toUpperCase()}
          </span>
        </a>
      ))}
    </div>
  );
}
