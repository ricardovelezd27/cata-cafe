import type { Metadata } from "next";
import { Newsreader, Hanken_Grotesk } from "next/font/google";
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

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "Cata Café Sensible",
  description: "Professional SCA CVA cupping",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${hankenGrotesk.variable} ${newsreader.variable} ${newsreaderItalic.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
