import {
  ACIDITY_CATA,
  SWEETNESS_CATA,
  MOUTHFEEL_CATA,
  MAIN_TASTES,
  L1_GROUP_COLOR,
  flavorNodeById,
  flavorNodeColor,
  migrateFlavorId,
} from "@/lib/constants";

/** Descriptor array keys for flavor/aroma sensory steps. */
export const FLAVOR_DESC_KEYS = [
  "fragancia_desc",
  "aroma_desc",
  "sabor_desc",
  "sabor_residual_desc",
] as const;

/** All sensory descriptor array keys (flavor/aroma + acidity/sweetness/mouthfeel). */
export const ALL_DESC_KEYS = [
  ...FLAVOR_DESC_KEYS,
  "acidez_desc",
  "dulzor_desc",
  "sensacion_desc",
] as const;

/**
 * The 7 descriptor-bearing cupping stages, in evaluation order. Single source
 * shared by the server aggregation and the client subtabs:
 * - `descKey`  — the JSON array key holding that stage's selected descriptor ids
 * - `attrId`   — the i18n `attributes.*` key for the stage's display label (es/en)
 */
export const DESCRIPTOR_STAGES = [
  { id: "fragancia",      descKey: "fragancia_desc",      attrId: "fragancia_af" },
  { id: "aroma",          descKey: "aroma_desc",          attrId: "aroma_af" },
  { id: "sabor",          descKey: "sabor_desc",          attrId: "sabor_af" },
  { id: "sabor_residual", descKey: "sabor_residual_desc", attrId: "sabor_residual_af" },
  { id: "acidez",         descKey: "acidez_desc",         attrId: "acidez_af" },
  { id: "dulzor",         descKey: "dulzor_desc",         attrId: "dulzor_af" },
  { id: "sensacion",      descKey: "sensacion_desc",      attrId: "sensacion_af" },
] as const;

export type DescriptorStageId = (typeof DESCRIPTOR_STAGES)[number]["id"];

/**
 * Perceptual blocks — the results-view grouping (N15). Each block aggregates one
 * or more raw stages, deduped PER CUPPER inside the block (so a cupper who picks
 * "chocolate" in both fragancia and aroma counts once for "chocolate" in Nariz).
 *
 * - `descKeys` — the evaluation JSON array keys unioned into the block. The
 *   special `gustos` block carries an empty `descKeys` and is resolved from the
 *   `gustos` key against MAIN_TASTES instead of the flavor wheel.
 * - `kind`     — `"desc"` blocks resolve via resolveDescriptor (flavor wheel +
 *   CATA sets); the `"taste"` block resolves via resolveMainTaste.
 * - `attrId`   — i18n `attributes.*` fallback label; blocks with a dedicated
 *   label pass `labelKey` (resolved by the caller from the `blocks` message set).
 */
export const PERCEPTUAL_BLOCKS = [
  { id: "nariz",     kind: "desc",  descKeys: ["fragancia_desc", "aroma_desc"],       labelKey: "nariz" },
  { id: "boca",      kind: "desc",  descKeys: ["sabor_desc", "sabor_residual_desc"],  labelKey: "boca" },
  { id: "gusto",     kind: "taste", descKeys: ["gustos"],                             labelKey: "gusto" },
  { id: "acidez",    kind: "desc",  descKeys: ["acidez_desc"],                        labelKey: "acidez" },
  { id: "dulzura",   kind: "desc",  descKeys: ["dulzor_desc"],                        labelKey: "dulzura" },
  { id: "sensacion", kind: "desc",  descKeys: ["sensacion_desc"],                     labelKey: "sensacion" },
] as const;

export type PerceptualBlockId = (typeof PERCEPTUAL_BLOCKS)[number]["id"];

/**
 * Resolve a MAIN_TASTES id (e.g. "sour") to its display label + neutral color.
 * MAIN_TASTES labels are Spanish-only, reused for both locales (parity with the
 * acidity/sweetness/mouthfeel CATA sets, which are also Spanish-only). The
 * `locale` param is accepted for a uniform signature with resolveDescriptor.
 */
export function resolveMainTaste(
  id: string,
  locale: "es" | "en" = "es"
): { label: string; color: string } | null {
  void locale;
  const t = MAIN_TASTES.find((m) => m.id === id);
  if (t) return { label: t.label, color: L1_GROUP_COLOR.other };
  return null;
}

type CATAFamily = {
  id: string;
  label: string;
  color: string;
  subItems: readonly { id: string; label: string }[];
};

// The acidity/sweetness/mouthfeel CATA sets (Spanish-only). The flavor wheel is
// handled separately via FLAVOR_WHEEL so resolveDescriptor sees all three levels.
const OTHER_CATA_SETS: readonly CATAFamily[] = [
  ...ACIDITY_CATA,
  ...SWEETNESS_CATA,
  ...MOUTHFEEL_CATA,
] as unknown as readonly CATAFamily[];

// Descriptors retired from their section's pickable list in later corrections
// (e.g. mouthfeel:gritty / mouthfeel:chalky merged into rugged/raspy; the
// acidity list was rebuilt from scratch and dropped several old entries).
// Old saved evaluations may still reference them, so they keep resolving here
// with a stand-in family's color instead of disappearing from historical results.
const LEGACY_DESCRIPTOR_LABELS: Record<
  string,
  { label: string; colorFamilyId: string }
> = {
  "mouthfeel:gritty": { label: "Granuloso", colorFamilyId: "mouthfeel:rough" },
  "mouthfeel:chalky": { label: "Calcáreo", colorFamilyId: "mouthfeel:rough" },
  // Retired acidity descriptors (N11 rebuild) — kept for historical resolution.
  "acidity:juicy":      { label: "Jugosa",     colorFamilyId: "acidity:bright" },
  "acidity:fruit_like": { label: "Afrutada",   colorFamilyId: "acidity:bright" },
  "acidity:tart":       { label: "Astringente", colorFamilyId: "acidity:bright" },
  "acidity:sharp":      { label: "Aguda",      colorFamilyId: "acidity:bright" },
  "acidity:vinegary":   { label: "Avinagrada", colorFamilyId: "acidity:bright" },
  "acidity:herbal":     { label: "Herbal",     colorFamilyId: "acidity:bright" },
  "acidity:grassy":     { label: "Herbácea",   colorFamilyId: "acidity:bright" },
  "acidity:dry":        { label: "Seca",       colorFamilyId: "acidity:bright" },
};

/**
 * Resolve a stored descriptor id (e.g. "floral", "fruity:berry",
 * "fruity:berry:blackberry", "acidity:juicy", "sweetness:honey",
 * "mouthfeel:gritty") to its display label and color.
 *
 * - Old ids whose path changed in the 3-level restructure are aliased first
 *   (migrateFlavorId), so existing saved sessions keep resolving.
 * - Flavor-wheel nodes resolve at any level and inherit their L1 group color.
 * - `locale` selects the flavor label language; the acidity/sweetness/mouthfeel
 *   sets are Spanish-only and fall back to their Spanish label for "en".
 */
/** Neutral color for free-text "unmapped" descriptors (matches the Other group). */
export const UNMAPPED_COLOR = L1_GROUP_COLOR.other;
/**
 * Prefix marking a legacy free-text descriptor the wheel didn't match (retired
 * N2 safety valve). The typeahead is now a CLOSED system (N10) — no new
 * `unmapped:` ids are ever created; every input resolves to a real wheel node,
 * with the typed term surviving only as a qualifying note. This prefix survives
 * solely to read old saved evaluations without crashing.
 */
export const UNMAPPED_PREFIX = "unmapped:";

/**
 * Fold a stored descriptor id into a closed-system pair: a real wheel node id
 * plus an optional qualifying note. Legacy `unmapped:<text>` ids map to the
 * generic `other` bucket with the free text preserved as the note, so
 * statistics count them under `other` and never as standalone entries. Any
 * other id passes through unchanged (no note).
 */
export function normalizeDescriptorId(id: string): { id: string; note?: string } {
  if (id.startsWith(UNMAPPED_PREFIX)) {
    return { id: "other", note: id.slice(UNMAPPED_PREFIX.length) };
  }
  return { id };
}

export function resolveDescriptor(
  id: string,
  locale: "es" | "en" = "es"
): { label: string; color: string } | null {
  // Legacy free-text safety-valve entries (retired N2 typeahead path): render as
  // an "Otros" note so old chips stay readable and never crash on old data.
  if (id.startsWith(UNMAPPED_PREFIX)) {
    const text = id.slice(UNMAPPED_PREFIX.length);
    const otrosLabel = locale === "en" ? "Other" : "Otros";
    return { label: `${otrosLabel} «${text}»`, color: UNMAPPED_COLOR };
  }
  const flavorId = migrateFlavorId(id);
  const node = flavorNodeById(flavorId);
  if (node) {
    return {
      label: locale === "en" ? node.label_en : node.label_es,
      color: flavorNodeColor(flavorId),
    };
  }
  for (const family of OTHER_CATA_SETS) {
    if (family.id === id) return { label: family.label, color: family.color };
    const sub = family.subItems.find((s) => s.id === id);
    if (sub) return { label: sub.label, color: family.color };
  }
  const legacy = LEGACY_DESCRIPTOR_LABELS[id];
  if (legacy) {
    const colorFamily = OTHER_CATA_SETS.find((f) => f.id === legacy.colorFamilyId);
    return { label: legacy.label, color: colorFamily?.color ?? UNMAPPED_COLOR };
  }
  return null;
}

/**
 * Collect the distinct descriptor ids selected within an evaluation data blob,
 * across the given keys. Deduped per blob so one cupper counts once per descriptor.
 */
export function collectDescriptors(
  data: Record<string, unknown>,
  keys: readonly string[] = ALL_DESC_KEYS
): string[] {
  const seen = new Set<string>();
  for (const key of keys) {
    const arr = data[key];
    if (Array.isArray(arr)) {
      for (const id of arr) {
        // Normalize legacy `unmapped:<text>` ids to the real `other` node so
        // stats only ever see real wheel-node ids (closed system, N10).
        if (typeof id === "string") seen.add(normalizeDescriptorId(id).id);
      }
    }
  }
  return Array.from(seen);
}
