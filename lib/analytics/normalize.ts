// Deterministic normalization of free-text coffee metadata (country, process,
// harvest year, altitude) shared by the analytics query engine and the
// reference-data import scripts. Client-safe — no server imports.
//
// Matching is exact-alias only (after canonicalization): trim → lowercase →
// strip accents → collapse non-alphanumerics. No fuzzy matching, so junk
// values ("dfghj") fall through as null instead of silently mis-matching;
// callers keep the raw value visible as its own bucket.

// Relative import (not "@/lib/…") so tsx-run import scripts resolve it without path aliases.
import { PROCESS_TYPES } from "../constants";

export interface CoffeeCountry {
  iso2: string;
  iso3: string;
  nameEs: string;
  nameEn: string;
  /** Extra spellings beyond names/codes, pre-canonicalized via normKey(). */
  aliases: string[];
}

/** Canonical key: lowercase, accent-stripped, non-alphanumerics collapsed to single spaces. */
export function normKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const COFFEE_COUNTRIES: CoffeeCountry[] = [
  { iso2: "CO", iso3: "COL", nameEs: "Colombia", nameEn: "Colombia", aliases: ["col"] },
  { iso2: "BR", iso3: "BRA", nameEs: "Brasil", nameEn: "Brazil", aliases: [] },
  { iso2: "ET", iso3: "ETH", nameEs: "Etiopía", nameEn: "Ethiopia", aliases: [] },
  { iso2: "KE", iso3: "KEN", nameEs: "Kenia", nameEn: "Kenya", aliases: [] },
  { iso2: "GT", iso3: "GTM", nameEs: "Guatemala", nameEn: "Guatemala", aliases: [] },
  { iso2: "MX", iso3: "MEX", nameEs: "México", nameEn: "Mexico", aliases: ["mejico"] },
  { iso2: "HN", iso3: "HND", nameEs: "Honduras", nameEn: "Honduras", aliases: [] },
  { iso2: "CR", iso3: "CRI", nameEs: "Costa Rica", nameEn: "Costa Rica", aliases: [] },
  { iso2: "SV", iso3: "SLV", nameEs: "El Salvador", nameEn: "El Salvador", aliases: ["salvador"] },
  { iso2: "NI", iso3: "NIC", nameEs: "Nicaragua", nameEn: "Nicaragua", aliases: [] },
  { iso2: "PA", iso3: "PAN", nameEs: "Panamá", nameEn: "Panama", aliases: [] },
  { iso2: "PE", iso3: "PER", nameEs: "Perú", nameEn: "Peru", aliases: [] },
  { iso2: "EC", iso3: "ECU", nameEs: "Ecuador", nameEn: "Ecuador", aliases: ["galapagos"] },
  { iso2: "BO", iso3: "BOL", nameEs: "Bolivia", nameEn: "Bolivia", aliases: [] },
  { iso2: "VE", iso3: "VEN", nameEs: "Venezuela", nameEn: "Venezuela", aliases: [] },
  { iso2: "ID", iso3: "IDN", nameEs: "Indonesia", nameEn: "Indonesia", aliases: ["sumatra", "java", "sulawesi"] },
  { iso2: "VN", iso3: "VNM", nameEs: "Vietnam", nameEn: "Vietnam", aliases: ["viet nam"] },
  { iso2: "TH", iso3: "THA", nameEs: "Tailandia", nameEn: "Thailand", aliases: [] },
  { iso2: "MM", iso3: "MMR", nameEs: "Myanmar", nameEn: "Myanmar", aliases: ["birmania", "burma"] },
  { iso2: "LA", iso3: "LAO", nameEs: "Laos", nameEn: "Laos", aliases: ["lao"] },
  { iso2: "CN", iso3: "CHN", nameEs: "China", nameEn: "China", aliases: ["yunnan"] },
  { iso2: "IN", iso3: "IND", nameEs: "India", nameEn: "India", aliases: [] },
  { iso2: "PH", iso3: "PHL", nameEs: "Filipinas", nameEn: "Philippines", aliases: [] },
  { iso2: "PG", iso3: "PNG", nameEs: "Papúa Nueva Guinea", nameEn: "Papua New Guinea", aliases: ["papua"] },
  { iso2: "YE", iso3: "YEM", nameEs: "Yemen", nameEn: "Yemen", aliases: [] },
  { iso2: "TZ", iso3: "TZA", nameEs: "Tanzania", nameEn: "Tanzania", aliases: ["tanzania united republic of"] },
  { iso2: "UG", iso3: "UGA", nameEs: "Uganda", nameEn: "Uganda", aliases: [] },
  { iso2: "RW", iso3: "RWA", nameEs: "Ruanda", nameEn: "Rwanda", aliases: [] },
  { iso2: "BI", iso3: "BDI", nameEs: "Burundi", nameEn: "Burundi", aliases: [] },
  { iso2: "MW", iso3: "MWI", nameEs: "Malaui", nameEn: "Malawi", aliases: ["malawi"] },
  { iso2: "ZM", iso3: "ZMB", nameEs: "Zambia", nameEn: "Zambia", aliases: [] },
  { iso2: "ZW", iso3: "ZWE", nameEs: "Zimbabue", nameEn: "Zimbabwe", aliases: [] },
  { iso2: "CD", iso3: "COD", nameEs: "RD Congo", nameEn: "DR Congo", aliases: ["congo", "congo dem rep", "democratic republic of the congo", "congo kinshasa"] },
  { iso2: "CI", iso3: "CIV", nameEs: "Costa de Marfil", nameEn: "Ivory Coast", aliases: ["cote d ivoire", "cote divoire"] },
  { iso2: "CM", iso3: "CMR", nameEs: "Camerún", nameEn: "Cameroon", aliases: [] },
  { iso2: "AO", iso3: "AGO", nameEs: "Angola", nameEn: "Angola", aliases: [] },
  { iso2: "MG", iso3: "MDG", nameEs: "Madagascar", nameEn: "Madagascar", aliases: [] },
  { iso2: "MZ", iso3: "MOZ", nameEs: "Mozambique", nameEn: "Mozambique", aliases: [] },
  { iso2: "GN", iso3: "GIN", nameEs: "Guinea", nameEn: "Guinea", aliases: [] },
  { iso2: "SL", iso3: "SLE", nameEs: "Sierra Leona", nameEn: "Sierra Leone", aliases: [] },
  { iso2: "LR", iso3: "LBR", nameEs: "Liberia", nameEn: "Liberia", aliases: [] },
  { iso2: "TG", iso3: "TGO", nameEs: "Togo", nameEn: "Togo", aliases: [] },
  { iso2: "GH", iso3: "GHA", nameEs: "Ghana", nameEn: "Ghana", aliases: [] },
  { iso2: "NG", iso3: "NGA", nameEs: "Nigeria", nameEn: "Nigeria", aliases: [] },
  { iso2: "CF", iso3: "CAF", nameEs: "Rep. Centroafricana", nameEn: "Central African Republic", aliases: [] },
  { iso2: "HT", iso3: "HTI", nameEs: "Haití", nameEn: "Haiti", aliases: [] },
  { iso2: "DO", iso3: "DOM", nameEs: "República Dominicana", nameEn: "Dominican Republic", aliases: ["rep dominicana"] },
  { iso2: "CU", iso3: "CUB", nameEs: "Cuba", nameEn: "Cuba", aliases: [] },
  { iso2: "JM", iso3: "JAM", nameEs: "Jamaica", nameEn: "Jamaica", aliases: ["blue mountain"] },
  { iso2: "PR", iso3: "PRI", nameEs: "Puerto Rico", nameEn: "Puerto Rico", aliases: ["united states puerto rico"] },
  { iso2: "US", iso3: "USA", nameEs: "Estados Unidos", nameEn: "United States", aliases: ["usa", "eeuu", "ee uu", "united states hawaii", "hawaii", "hawai", "kona"] },
  { iso2: "TW", iso3: "TWN", nameEs: "Taiwán", nameEn: "Taiwan", aliases: [] },
  { iso2: "JP", iso3: "JPN", nameEs: "Japón", nameEn: "Japan", aliases: [] },
  { iso2: "MU", iso3: "MUS", nameEs: "Mauricio", nameEn: "Mauritius", aliases: [] },
  { iso2: "TL", iso3: "TLS", nameEs: "Timor Oriental", nameEn: "Timor-Leste", aliases: ["east timor", "timor leste"] },
  { iso2: "NP", iso3: "NPL", nameEs: "Nepal", nameEn: "Nepal", aliases: [] },
];

let countryIndex: Map<string, CoffeeCountry> | null = null;

function getCountryIndex(): Map<string, CoffeeCountry> {
  if (countryIndex) return countryIndex;
  countryIndex = new Map();
  for (const c of COFFEE_COUNTRIES) {
    const keys = [c.iso2, c.iso3, c.nameEs, c.nameEn, ...c.aliases];
    for (const k of keys) {
      countryIndex.set(normKey(k), c);
    }
  }
  return countryIndex;
}

export interface NormalizedCountry {
  iso2: string;
  nameEs: string;
  nameEn: string;
}

/** Exact-alias country lookup; null when unmatched (caller keeps the raw text). */
export function normalizeCountry(raw: string | null | undefined): NormalizedCountry | null {
  if (!raw) return null;
  const key = normKey(raw);
  if (!key) return null;
  const c = getCountryIndex().get(key);
  return c ? { iso2: c.iso2, nameEs: c.nameEs, nameEn: c.nameEn } : null;
}

export function countryDisplayName(iso2: string, locale: string): string | null {
  const c = COFFEE_COUNTRIES.find((x) => x.iso2 === iso2);
  if (!c) return null;
  return locale === "en" ? c.nameEn : c.nameEs;
}

export type CanonicalProcess = (typeof PROCESS_TYPES)[number];

// Alias → canonical PROCESS_TYPES value. Keys are normKey() outputs.
const PROCESS_ALIASES: Record<string, CanonicalProcess> = {
  // Lavado
  lavado: "Lavado",
  washed: "Lavado",
  wet: "Lavado",
  "washed wet": "Lavado",
  "fully washed": "Lavado",
  "lavado humedo": "Lavado",
  // Natural
  natural: "Natural",
  dry: "Natural",
  "natural dry": "Natural",
  seco: "Natural",
  "sun dried": "Natural",
  // Honey (incl. CQI's semi-washed / pulped-natural family)
  honey: "Honey",
  miel: "Honey",
  "pulped natural": "Honey",
  "pulped natural honey": "Honey",
  "semi washed": "Honey",
  "semi washed semi pulped": "Honey",
  "semi pulped": "Honey",
  semilavado: "Honey",
  "honey amarillo": "Honey",
  "honey rojo": "Honey",
  "honey negro": "Honey",
  "yellow honey": "Honey",
  "red honey": "Honey",
  "black honey": "Honey",
  "white honey": "Honey",
  // Anaeróbico
  anaerobico: "Anaeróbico",
  anaerobic: "Anaeróbico",
  "fermentacion anaerobica": "Anaeróbico",
  "anaerobic natural": "Anaeróbico",
  "natural anaerobico": "Anaeróbico",
  "anaerobic washed": "Anaeróbico",
  "lavado anaerobico": "Anaeróbico",
  // Maceración Carbónica
  "maceracion carbonica": "Maceración Carbónica",
  "carbonic maceration": "Maceración Carbónica",
  // Láctico
  lactico: "Láctico",
  lactic: "Láctico",
  "fermentacion lactica": "Láctico",
  // Co-fermentación
  "co fermentacion": "Co-fermentación",
  cofermentacion: "Co-fermentación",
  "co fermentation": "Co-fermentación",
  "co fermented": "Co-fermentación",
  cofermented: "Co-fermentación",
  // Otro
  otro: "Otro",
  otros: "Otro",
  other: "Otro",
};

/** Exact-alias process lookup onto the canonical PROCESS_TYPES list; null when unmatched. */
export function normalizeProcess(raw: string | null | undefined): CanonicalProcess | null {
  if (!raw) return null;
  const key = normKey(raw);
  if (!key) return null;
  // Canonical values match themselves ("Maceración Carbónica" → "maceracion carbonica").
  return PROCESS_ALIASES[key] ?? null;
}

/** First plausible 4-digit year in the text ("2023/2024" → 2023); null when absent. */
export function parseHarvestYear(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/(19|20)\d{2}/);
  if (!m) return null;
  const year = parseInt(m[0], 10);
  return year >= 1950 && year <= 2100 ? year : null;
}

/**
 * Altitude in meters from free text ("1950-2200", "1.700 msnm", "1,700m").
 * Ranges collapse to their midpoint. Values outside 0–4500 m (e.g. feet
 * entered as meters) return null rather than guessing a conversion.
 */
export function parseAltitudeMeters(raw: string | null | undefined): number | null {
  if (!raw) return null;
  // "1,700" / "1.700" thousands separators → plain digits.
  const cleaned = raw.replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2");
  const matches = cleaned.match(/\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length === 0) return null;
  const nums = matches
    .map((m) => parseFloat(m.replace(",", ".")))
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const mid = Math.round((min + max) / 2);
  return mid > 0 && mid <= 4500 ? mid : null;
}

export interface AltitudeBand {
  /** Sortable key "0".."6" (localeCompare-safe). */
  key: string;
  label: string;
}

const ALTITUDE_BANDS: AltitudeBand[] = [
  { key: "0", label: "<1000 m" },
  { key: "1", label: "1000–1199 m" },
  { key: "2", label: "1200–1399 m" },
  { key: "3", label: "1400–1599 m" },
  { key: "4", label: "1600–1799 m" },
  { key: "5", label: "1800–1999 m" },
  { key: "6", label: "2000+ m" },
];

export function altitudeBand(meters: number): AltitudeBand {
  if (meters < 1000) return ALTITUDE_BANDS[0];
  if (meters >= 2000) return ALTITUDE_BANDS[6];
  return ALTITUDE_BANDS[Math.floor((meters - 1000) / 200) + 1];
}

export function altitudeBandByKey(key: string): AltitudeBand | null {
  return ALTITUDE_BANDS.find((b) => b.key === key) ?? null;
}
