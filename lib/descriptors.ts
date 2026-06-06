import {
  FLAVOR_FAMILIES,
  ACIDITY_CATA,
  SWEETNESS_CATA,
  MOUTHFEEL_CATA,
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

type CATAFamily = {
  id: string;
  label: string;
  color: string;
  subItems: readonly { id: string; label: string }[];
};

// All four descriptor families, searched in order by resolveDescriptor.
const ALL_FAMILIES: readonly CATAFamily[] = [
  ...FLAVOR_FAMILIES,
  ...ACIDITY_CATA,
  ...SWEETNESS_CATA,
  ...MOUTHFEEL_CATA,
] as unknown as readonly CATAFamily[];

/**
 * Resolve a stored descriptor id (e.g. "floral", "fruity:berry", "acidity:juicy",
 * "sweetness:honey", "mouthfeel:gritty") to its display label and color.
 * Sub-items inherit their parent family's color.
 */
export function resolveDescriptor(
  id: string
): { label: string; color: string } | null {
  for (const family of ALL_FAMILIES) {
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
