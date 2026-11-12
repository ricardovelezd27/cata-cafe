import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "en"],
  defaultLocale: "es",
  // "/" rewrites internally to Spanish (no redirect, no flicker); "/en" stays prefixed.
  localePrefix: "as-needed",
  // Never bounce "/" to "/en" based on cookie or Accept-Language.
  localeDetection: false,
  // The app never reads the NEXT_LOCALE cookie (detection is off above), so do not
  // set it: the privacy policy's cookie table lists only the cookies that exist
  // (S10 WP9a). next-intl's syncCookie returns early when this is false.
  localeCookie: false,
  // hreflang is emitted via generateMetadata on the landing page instead.
  alternateLinks: false,
});

export type Locale = (typeof routing.locales)[number];
