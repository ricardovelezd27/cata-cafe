import type { Metadata, Viewport } from "next";
import { Newsreader, Hanken_Grotesk } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { siteOrigin } from "@/lib/inviteUrl";
import { routing } from "@/i18n/routing";
import "./globals.css";

// Single variable-font file instead of three static weight cuts. Not
// preloaded: it swaps in with a metric-matched fallback, keeping the
// landing page's LCP critical path down to one font file.
const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

// "optional": if the font misses the first paint window it waits for the
// next navigation instead of swapping mid-view. Avoids the late repaint of
// the landing hero <h1> that hurt LCP on slow connections.
const newsreader = Newsreader({
  style: ["normal"],
  variable: "--font-display",
  subsets: ["latin"],
  display: "optional",
});

// True italics load lazily, only on pages that use .display-italic —
// keeps them out of the landing page's preload critical path.
const newsreaderItalic = Newsreader({
  style: ["italic"],
  variable: "--font-display-italic",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

// viewportFit "cover" makes env(safe-area-inset-*) report real values on iOS,
// which the cupping footer uses to keep its buttons out of the gesture zone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android Chrome: shrink the layout viewport when the keyboard opens so the
  // fixed cupping shell reflows above it. iOS Safari ignores this — there the
  // visualViewport listener in hooks/useKeyboardOpen.ts does the work.
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "Café Sensible",
  description:
    "La herramienta del Método Café Sensible: cata SCA CVA en grupo con referencia del instructor y convergencia visible.",
};

// The first path segment is the locale only for the non-default ones ("/en");
// everything else is the default. No regular expression on purpose: this is a
// string inside a string, and an escape lost on the way would break it.
const OTHER_LOCALES = routing.locales.filter((l) => l !== routing.defaultLocale);
const HTML_LANG_SCRIPT = `(function(){var s=location.pathname.split("/")[1];document.documentElement.lang=${JSON.stringify(OTHER_LOCALES)}.indexOf(s)>-1?s:${JSON.stringify(routing.defaultLocale)}})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${hankenGrotesk.variable} ${newsreader.variable} ${newsreaderItalic.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* <html> is rendered here, above [locale], with lang="es". Correct
            it before paint from the URL ("/en" and below). It lives in the
            root layout because this layout is never mounted again on a
            client-side navigation; a change of language without a reload
            sets the attribute itself (components/landing/LocaleSwitch.tsx). */}
        <script dangerouslySetInnerHTML={{ __html: HTML_LANG_SCRIPT }} />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
