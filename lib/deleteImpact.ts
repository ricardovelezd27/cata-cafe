// Pure helpers behind the session delete dialog (S8-10 T5, F-sesiones-4):
// the dialog must say what is permanent AND split submitted work from drafts.

/** Drafts = everything that is not submitted; never negative. */
export function splitEvaluationCounts(
  total: number,
  submitted: number,
): { submittedCount: number; draftCount: number } {
  const submittedCount = Math.max(0, Math.min(submitted, total));
  return { submittedCount, draftCount: Math.max(0, total - submittedCount) };
}

/** Substitutes every `{name}` token; unknown tokens stay visible. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m,
  );
}
