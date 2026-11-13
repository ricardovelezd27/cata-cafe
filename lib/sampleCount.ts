// Sample-count warning (S10 WP2 / X6). A WARNING, never a cap: creation is
// never blocked. Kim: "Máximo 6 muestras por sesión, y menos en combinado.
// Que la app avise si alguien pone 10."
// TODO(kim-validar:X6): simulated answer; thresholds to confirm.

export const SAMPLE_WARN_ABOVE = 6;
export const SAMPLE_WARN_ABOVE_COMBINED = 4;

export type SampleCountWarning = "many" | "combined";

/** Which warning line to show for `count` samples in `format`, or null.
 *  The combined-format line wins when both thresholds are crossed (it is the
 *  tighter one). */
export function sampleCountWarning(format: string, count: number): SampleCountWarning | null {
  if (format === "combined" && count > SAMPLE_WARN_ABOVE_COMBINED) return "combined";
  if (count > SAMPLE_WARN_ABOVE) return "many";
  return null;
}
