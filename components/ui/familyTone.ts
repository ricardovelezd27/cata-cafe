import type { WheelFamilyId } from "@/lib/flavorWheel";
import styles from "./familyTone.module.css";

// Full, static class names (Tailwind 4 and CSS Modules both need them written
// out): one per family id of lib/flavorWheel.ts.
const FAMILY_TONE_CLASS: Record<WheelFamilyId, string> = {
  floral: styles.floral,
  fruity: styles.fruity,
  sour_fermented: styles.sour_fermented,
  green_veg: styles.green_veg,
  other: styles.other,
  roasted: styles.roasted,
  spice: styles.spice,
  nutty_cocoa: styles.nutty_cocoa,
  sweet: styles.sweet,
};

/**
 * The class that sets `--family-tone` for a flavour family (or the neutral tone
 * without one). The element that takes it, or anything inside it, paints a
 * SHAPE with `var(--family-tone)`: a dot, a bar, a petal. Never text.
 */
export function familyToneClass(family?: WheelFamilyId | null): string {
  return (family && FAMILY_TONE_CLASS[family]) || styles.neutral;
}
