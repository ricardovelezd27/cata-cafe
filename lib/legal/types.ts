// Shape of a legal document. Pure data, typed {es,en}; the pages render it.
export type LegalSection = { heading: string; body: string[] };
export type LegalDoc = { title: string; sections: LegalSection[] };
export type LegalLocale = "es" | "en";
export type LegalDocs = Record<LegalLocale, LegalDoc>;
