// Facts about the company that operates Café Sensible, as given by the owner
// in his legal documents (Privacy, Terms, Legal notice; version 1.0, written
// for another product of the same company and adapted here, S10 WP9).
//
// TODO(owner): REGISTRO MERCANTIL. The source documents leave the registry
// data as an unfilled placeholder and say it is mandatory under LSSI-CE
// art. 10.1(b) for a Sociedad Limitada. Fill `registry` (tomo, folio, hoja,
// inscripción) from the deed of incorporation; while it is null the pages
// omit that line.
//
// TODO(owner): FOUNDING OFFER. Terms section 6 says only that reserving a seat
// implies no payment; the offer's conditions are yours to write.
// TODO(owner): TRANSFER SAFEGUARDS. Privacy section 4 states the Vercel and
// Resend safeguards generically ("garantías del Capítulo V"); check them
// against the actual DPAs/SCCs.
// TODO(owner): CONTACT. The pages use the app's support address
// (lib/siteContact.ts), not the personal address and phone printed in the
// source documents.
export const LEGAL_ENTITY = {
  name: "Just a Simple Company, S.L.",
  cif: "B27544147",
  address: "Calle Marqués de Urquijo 2, 28008, Madrid, España",
  registry: null as string | null,
  cnae: "6201 — Actividades de programación informática",
  product: "Café Sensible",
  site: "cafesensible.ai",
} as const;

/** The published text's version, shown under each title. */
export const LEGAL_TEXT_VERSION = {
  es: "Versión 1.0 — noviembre de 2026",
  en: "Version 1.0 — November 2026",
} as const;
