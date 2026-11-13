// What a revealed sample freezes on the cup page (S10 WP3a, Kim X3,
// TODO(kim-validar:X3)). ONE pure place for it, used by CupClient's
// `setSampleData` (state + autosave) and by the read-only render of the form.
//
// The freeze concerns the cupper's EVALUATION module: ratings, descriptors, cup
// checks, the quick note and the market note all live in `descriptive` /
// `affective` / `combined`. `physical` and `extrinsic` are the owner's
// per-sample rows, entered after the reveal by design, so they are NEVER
// frozen. The server twin is `evaluationWriteAllowed` (lib/sessionState.ts).

/** The Sample keys that hold the cupper's evaluation (frozen once revealed). */
export const EVALUATION_MODULE_KEYS = ["descriptive", "affective", "combined"] as const;

/** True when a change to `key` must be ignored because the sample is revealed. */
export function isModuleFrozenForRevealed(input: { revealed: boolean; key: string }): boolean {
  return input.revealed && (EVALUATION_MODULE_KEYS as readonly string[]).includes(input.key);
}

/** True when the evaluation form (the "cupping" tab) must render read-only. The
 *  owner's origin and physical tabs stay editable. */
export function isEvaluationReadOnly(input: { revealed: boolean; activeTab: string }): boolean {
  return input.revealed && input.activeTab === "cupping";
}
