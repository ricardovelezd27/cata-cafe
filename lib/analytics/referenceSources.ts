// Attribution metadata for third-party reference datasets. Static and
// bilingual, shared by the insights UI, PDF reports, and email digests.
// Licenses (MIT / CC BY 4.0 / public domain) permit commercial use WITH
// attribution — every surface that shows derived numbers must render the
// citation line for the sources involved.

export type ReferenceSourceId = "cqi_arabica" | "owid_fao" | "usda_psd";

export interface ReferenceSource {
  id: ReferenceSourceId;
  nameEs: string;
  nameEn: string;
  license: string;
  citationEs: string;
  citationEn: string;
  url: string;
  /** ISO date the vendored copy in scripts/data/ was downloaded. */
  retrieved: string;
}

export const REFERENCE_SOURCES: ReferenceSource[] = [
  {
    id: "cqi_arabica",
    nameEs: "Base de datos de catación CQI (arábica)",
    nameEn: "CQI arabica cupping database",
    license: "MIT",
    citationEs:
      "Datos de referencia: Coffee Quality Institute (CQI), base de datos de cataciones de arábica compilada por J. LeDoux (licencia MIT). Datos históricos hasta 2018.",
    citationEn:
      "Benchmark data: Coffee Quality Institute (CQI) arabica cupping database compiled by J. LeDoux (MIT license). Historical data through 2018.",
    url: "https://github.com/jldbc/coffee-quality-database",
    retrieved: "2026-07-20",
  },
  {
    id: "owid_fao",
    nameEs: "Producción de café verde (FAO / Our World in Data)",
    nameEn: "Green coffee production (FAO / Our World in Data)",
    license: "CC BY 4.0",
    citationEs:
      "Serie de producción: FAO (FAOSTAT), procesada por Our World in Data. Licencia CC BY 4.0.",
    citationEn:
      "Production series: FAO (FAOSTAT), processed by Our World in Data. CC BY 4.0 license.",
    url: "https://ourworldindata.org/grapher/coffee-bean-production",
    retrieved: "2026-07-20",
  },
  {
    id: "usda_psd",
    nameEs: "Producción, oferta y distribución de café (USDA FAS)",
    nameEn: "Coffee production, supply & distribution (USDA FAS)",
    license: "Public domain (US Government)",
    citationEs:
      "Serie de consumo y comercio: USDA Foreign Agricultural Service, PSD Online (dominio público).",
    citationEn:
      "Consumption and trade series: USDA Foreign Agricultural Service, PSD Online (public domain).",
    url: "https://apps.fas.usda.gov/psdonline/",
    retrieved: "2026-07-20",
  },
];

export function referenceSourceById(id: ReferenceSourceId): ReferenceSource {
  const source = REFERENCE_SOURCES.find((s) => s.id === id);
  if (!source) throw new Error(`Unknown reference source: ${id}`);
  return source;
}

/** Citation lines for a set of sources in the given locale (dedup, stable order). */
export function citationLines(ids: ReferenceSourceId[], locale: string): string[] {
  const unique = REFERENCE_SOURCES.filter((s) => ids.includes(s.id));
  return unique.map((s) => (locale === "en" ? s.citationEn : s.citationEs));
}
