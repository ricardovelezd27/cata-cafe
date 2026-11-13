// The class list of the score pill (S10 WP3a, Kim A10, TODO(kim-validar:A10)).
// It takes NO score on purpose: a score is a number, never coloured or named by
// quality. A test pins that the output is one constant with no quality token.
export function scorePillClasses(): string {
  return "inline-flex items-center rounded-pill px-2.5 py-0.5 text-sm font-semibold tabular-nums bg-surface-container-high text-on-surface";
}
