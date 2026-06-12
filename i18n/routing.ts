import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "en"],
  defaultLocale: "es",
  // "/" rewrites internally to Spanish (no redirect, no flicker); "/en" stays prefixed.
  localePrefix: "as-needed",
  // Never bounce "/" to "/en" based on cookie or Accept-Language.
  localeDetection: false,
  // hreflang is emitted via generateMetadata on the landing page instead.
  alternateLinks: false,
});

export type Locale = (typeof routing.locales)[number];
