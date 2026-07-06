import Fuse from "fuse.js";
import {
  FLAVOR_WHEEL,
  flavorNodeById,
  flavorNodeColor,
  type FlavorWheelNode,
  type FlavorLevel,
} from "@/lib/constants";

/**
 * Predictive search over the flavor wheel (N2). A flat index is built once from
 * FLAVOR_WHEEL and queried with accent-insensitive direct matching plus a Fuse.js
 * fuzzy fallback so typos ("framuesa") still resolve. Results carry the full
 * breadcrumb path so the cupper confirms which group a descriptor files under —
 * the typeahead is a filter over the same wheel the modal browses, not a new flow.
 */

export type FlavorMatchType = "exact" | "prefix" | "synonym" | "fuzzy" | "parent";

export type FlavorMatch = {
  /** Full colon-path id, e.g. "fruity:berry:raspberry" — stored as-is. */
  id: string;
  /** Display label in the requested locale. */
  label: string;
  /** Ancestor breadcrumb in the requested locale, e.g. "Afrutado › Berry" ("" for L1). */
  path: string;
  level: FlavorLevel;
  /** L1 group color (descendants inherit). */
  color: string;
  matchType: FlavorMatchType;
};

/** NFD-strip diacritics + lowercase so "limon" matches "Limón". */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Ancestor labels (root-first, excluding the node itself) for the breadcrumb. */
function pathLabels(node: FlavorWheelNode, lang: "es" | "en"): string {
  const out: string[] = [];
  let p = node.parentId ? flavorNodeById(node.parentId) : undefined;
  while (p) {
    out.unshift(lang === "en" ? p.label_en : p.label_es);
    p = p.parentId ? flavorNodeById(p.parentId) : undefined;
  }
  return out.join(" › ");
}

type IndexEntry = {
  id: string;
  level: FlavorLevel;
  color: string;
  label_es: string;
  label_en: string;
  pathEs: string;
  pathEn: string;
  n_es: string;
  n_en: string;
  n_syn: string[];
};

const INDEX: IndexEntry[] = FLAVOR_WHEEL.map((n) => ({
  id: n.id,
  level: n.level,
  color: flavorNodeColor(n.id),
  label_es: n.label_es,
  label_en: n.label_en,
  pathEs: pathLabels(n, "es"),
  pathEn: pathLabels(n, "en"),
  n_es: norm(n.label_es),
  n_en: norm(n.label_en),
  n_syn: n.synonyms.map(norm),
}));

const fuse = new Fuse(INDEX, {
  keys: [
    { name: "n_es", weight: 0.4 },
    { name: "n_en", weight: 0.4 },
    { name: "n_syn", weight: 0.2 },
  ],
  threshold: 0.3,
  ignoreLocation: true,
  includeScore: true,
  minMatchCharLength: 2,
});

/** Leaves (L3) rank ahead of inner rings within the same match strength. */
function levelBias(level: FlavorLevel): number {
  return level === 3 ? 0 : level === 2 ? 0.4 : 0.8;
}

/**
 * Best direct (accent-insensitive) match strength for an entry, or null.
 * Lower rank = stronger. label exact(0) < label prefix(1) < synonym(2) <
 * label substring(3) < synonym substring(4).
 */
function directMatch(
  e: IndexEntry,
  q: string
): { rank: number; matchType: FlavorMatchType } | null {
  let best: { rank: number; matchType: FlavorMatchType } | null = null;
  const take = (rank: number, matchType: FlavorMatchType) => {
    if (!best || rank < best.rank) best = { rank, matchType };
  };
  for (const n of [e.n_es, e.n_en]) {
    if (!n) continue;
    if (n === q) take(0, "exact");
    else if (n.startsWith(q)) take(1, "prefix");
    else if (n.includes(q)) take(3, "prefix");
  }
  for (const n of e.n_syn) {
    if (!n) continue;
    if (n === q || n.startsWith(q)) take(2, "synonym");
    else if (n.includes(q)) take(4, "synonym");
  }
  return best;
}

/**
 * Rank flavor descriptors matching `query`.
 * Ordering: exact leaf > prefix > synonym > substring > fuzzy, with leaves (L3)
 * ahead of inner rings (L2/L1) at equal strength. Inner-ring matches are tagged
 * "parent" so callers can show they file under a broader group (handbook rule).
 */
export function searchFlavors(
  query: string,
  opts?: { locale?: "es" | "en"; limit?: number }
): FlavorMatch[] {
  const locale = opts?.locale ?? "es";
  const limit = opts?.limit ?? 8;
  const q = norm(query);
  if (q.length < 1) return [];

  const scored = new Map<
    string,
    { entry: IndexEntry; rank: number; matchType: FlavorMatchType }
  >();
  const consider = (
    entry: IndexEntry,
    rank: number,
    matchType: FlavorMatchType
  ) => {
    const prev = scored.get(entry.id);
    if (!prev || rank < prev.rank) scored.set(entry.id, { entry, rank, matchType });
  };

  // Direct matches first (guarantees exact/prefix surface regardless of Fuse).
  for (const e of INDEX) {
    const m = directMatch(e, q);
    if (m) {
      const matchType =
        e.level < 3 && m.matchType !== "synonym" ? "parent" : m.matchType;
      consider(e, m.rank + levelBias(e.level), matchType);
    }
  }

  // Fuzzy fallback for typo tolerance (skip 1-char queries — too noisy).
  if (q.length >= 2) {
    for (const r of fuse.search(q)) {
      const e = r.item;
      const rank = 5 + (r.score ?? 0) + levelBias(e.level);
      const matchType: FlavorMatchType = e.level < 3 ? "parent" : "fuzzy";
      consider(e, rank, matchType);
    }
  }

  return Array.from(scored.values())
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.entry.level - b.entry.level ||
        a.entry.label_es.length - b.entry.label_es.length
    )
    .slice(0, limit)
    .map(({ entry, matchType }) => ({
      id: entry.id,
      label: locale === "en" ? entry.label_en : entry.label_es,
      path: locale === "en" ? entry.pathEn : entry.pathEs,
      level: entry.level,
      color: entry.color,
      matchType,
    }));
}
