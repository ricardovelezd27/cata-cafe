// Pure helper shared by the PDF routes (cva-pdf, participant-summary).

/** ASCII-safe filename fragment (Content-Disposition filenames choke on accents). */
export function slug(input: string): string {
  // NFD splits accented letters into base + combining mark; the alnum filter
  // then drops the marks, so "Café" → "cafe" without a fragile combining-range.
  return input
    .normalize("NFD")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .toLowerCase();
}
