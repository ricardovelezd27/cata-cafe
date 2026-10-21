// Pure text helpers for PDF rendering. The bundled fonts (public/fonts) cover
// Latin + common symbols but no emoji; react-pdf renders missing glyphs as
// garbage ("letras mezcladas"), so user-authored strings are cleaned here.

/** Strip emoji / pictographs / supplementary-plane characters and joiners. */
export function sanitizePdfText(s: string): string {
  if (!s) return s;
  return s
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{10000}-\u{10FFFF}]/gu, "") // any remaining surrogate pairs
    .replace(/[‍︎️⃣]/g, "") // ZWJ, variation selectors, keycap
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
