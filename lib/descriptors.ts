import {
  ACIDITY_CATA,
  SWEETNESS_CATA,
  MOUTHFEEL_CATA,
  flavorNodeById,
  flavorGroupColor,
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
export function resolveDescriptor(
  id: string,
  locale: "es" | "en" = "es"
): { label: string; color: string } | null {
  const flavorId = migrateFlavorId(id);
  const node = flavorNodeById(flavorId);
  if (node) {
    return {
      label: locale === "en" ? node.label_en : node.label_es,
      color: flavorGroupColor(flavorId),
    };
  }
  for (const family of OTHER_CATA_SETS) {
    if (family.id === id) return { label: family.label, color: family.color };
    const sub = family.subItems.find((s) => s.id === id);
    if (sub) return { label: sub.label, color: family.color };
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
        if (typeof id === "string") seen.add(id);
      }
    }
  }
  return Array.from(seen);
}
