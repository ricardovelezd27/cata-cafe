// Single registration point for @react-pdf fonts. The built-in PDF fonts
// (Helvetica/Times) are WinAnsi-only: they cannot draw Σ, ▼, emoji or any
// non-Latin-1 user text, which showed up as scrambled glyphs ("letras
// mezcladas"). We ship static TTFs in public/fonts (react-pdf cannot use
// variable fonts) — Newsreader (serif) and Hanken Grotesk (sans), per
// DESIGN.md. Neither covers Σ / ▼ / emoji: those are replaced in the
// documents (vector triangle, "sum") or stripped (lib/pdf/text.ts).
//
// Server-only. Import for side effects from every PDF document module; the
// call is idempotent. public/fonts must be traced into serverless bundles —
// see outputFileTracingIncludes in next.config.ts.

import path from "node:path";
import { Font } from "@react-pdf/renderer";

export const SERIF = "Newsreader";
export const SANS = "Hanken";

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;
  registered = true;
  const dir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: SERIF,
    fonts: [
      { src: path.join(dir, "Newsreader-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "Newsreader-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(dir, "Newsreader-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: SANS,
    fonts: [
      { src: path.join(dir, "HankenGrotesk-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "HankenGrotesk-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(dir, "HankenGrotesk-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Disable mid-word hyphenation document-wide: react-pdf's default breaker
  // splits words like "GLOBAL" into "GLOB-AL" in narrow columns. Paper forms
  // wrap at spaces only.
  Font.registerHyphenationCallback((word) => [word]);
}
