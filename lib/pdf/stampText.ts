// Pure text for the report "stamp" (S8-12, F-informes-3 / F-resultados-8):
// when a PDF was generated (server clock), in which language, how many cuppers
// the group numbers rest on, and whether the data changed after the close.
// Dependency-free so it can be unit-tested; ReportStamp.tsx only draws it.

export type StampLocale = "es" | "en";

export type StampInput = {
  locale: StampLocale;
  /** Server clock at render time. */
  generatedAt: Date;
  /** "n de N": cuppers included in the group numbers / cuppers who submitted. */
  inclusion?: { included: number; total: number } | null;
  /** The viewer's OWN evaluation was left out of the group numbers. */
  viewerExcluded?: boolean;
  /** Group results changed after the session closed. */
  resultsUpdatedAt?: Date | null;
  /** Origin data was corrected after the session closed. */
  originEditedAt?: Date | null;
  /** The document shows an unsent (draft) evaluation. */
  draft?: boolean;
};

const COPY = {
  es: {
    lang: "ES",
    generated: (date: string) => `Generado el ${date} UTC`,
    inclusion: (n: number, total: number) =>
      `${n} de ${total} catadores incluidos en los resultados del grupo`,
    viewerExcluded:
      "Tu evaluación no está incluida en los números del grupo (la excluyó el propietario de la sesión).",
    updated: (date: string) => `Resultados actualizados el ${date} UTC, después del cierre`,
    origin: (date: string) => `Datos de origen editados el ${date} UTC`,
    draft: "BORRADOR · evaluación sin enviar",
  },
  en: {
    lang: "EN",
    generated: (date: string) => `Generated on ${date} UTC`,
    inclusion: (n: number, total: number) =>
      `${n} of ${total} cuppers included in the group results`,
    viewerExcluded:
      "Your evaluation is not included in the group numbers (the session owner excluded it).",
    updated: (date: string) => `Results updated on ${date} UTC, after the session closed`,
    origin: (date: string) => `Origin data edited on ${date} UTC`,
    draft: "DRAFT · unsent evaluation",
  },
} as const;

/** "10 nov 2026, 14:32" in UTC — the server has no user timezone, so the stamp
 *  says UTC instead of pretending. */
export function stampDateTime(d: Date, locale: StampLocale): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-CO" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(d);
}

/** The draft marker alone (CVA footer repeats it on every page). */
export function draftLabel(locale: StampLocale): string {
  return COPY[locale].draft;
}

/** Lines in display order: draft first, then the clock, then data caveats. */
export function buildStampLines(input: StampInput): string[] {
  const c = COPY[input.locale];
  const lines: string[] = [];
  if (input.draft) lines.push(c.draft);
  lines.push(`${c.generated(stampDateTime(input.generatedAt, input.locale))} · ${c.lang}`);
  if (input.inclusion && input.inclusion.total > 0) {
    lines.push(c.inclusion(input.inclusion.included, input.inclusion.total));
  }
  if (input.viewerExcluded) lines.push(c.viewerExcluded);
  if (input.resultsUpdatedAt) {
    lines.push(c.updated(stampDateTime(input.resultsUpdatedAt, input.locale)));
  }
  if (input.originEditedAt) {
    lines.push(c.origin(stampDateTime(input.originEditedAt, input.locale)));
  }
  return lines;
}

/** One line for page footers. */
export function buildStampLine(input: StampInput): string {
  return buildStampLines(input).join(" · ");
}
