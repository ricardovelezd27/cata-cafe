// S10 WP5b (B2, TODO(kim-validar:B2)): the one key under which a pinned
// reference keeps the cupper's PREVIOUS affective input inside the same module
// JSON, so that marking a sample as the reference never destroys their ratings
// and "quitar la referencia" can give them back. A tiny dependency-free module
// so lib/evaluation.ts can use it without importing lib/referenceRules.ts
// (which imports lib/evaluation.ts).
//
// SERVER-OWNED: no client can set, change or delete it. The shared derivation
// (computeEvaluationDerived) strips it from every payload and only re-attaches
// the stash a trusted server caller hands it. Invisible to scoring, to
// completeness and to every report (the trigger never reads this JSON key).

export const REF_STASH_KEY = "ref_previo";

/** `valores[key]` is the value the pin overwrote; `null` means the key was ABSENT
 *  before the pin (so a restore deletes it). */
export type RefStash = {
  /** ISO timestamp of the pin that created the stash. */
  at: string;
  valores: Record<string, unknown>;
};
