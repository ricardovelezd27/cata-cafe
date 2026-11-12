/** One block of a legal section: a paragraph, a bullet list, or a two-column table. */
export type LegalBlock = string | { list: string[] } | { rows: [string, string][] };
export type LegalSection = { heading: string; body: LegalBlock[] };
export type LegalDoc = {
  title: string;
  /** Shown under the title, e.g. "Versión 1.0 — noviembre de 2026". */
  version: string;
  /** Optional paragraphs before the first section. */
  intro?: LegalBlock[];
  sections: LegalSection[];
};
export type LegalLocale = "es" | "en";
export type LegalDocs = Record<LegalLocale, LegalDoc>;
