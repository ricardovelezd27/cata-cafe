// A-01 / decision 10 (2026-11-16, packages F2 and F2b): a cupper's OWN total is
// shown only for an evaluation that was SENT ("Enviar"; a stored row with
// isDraft === false). "Nobody decides the number and works backwards": an
// unsent draft never shows its total or the arithmetic line under it, on the
// results page, the print page or the CVA PDF, whether the session is open,
// closed or past its closing date (Ricardo, 2026-11-17: "Hide it"). The
// ratings themselves are still shown to their author.
//
// ONE rule, dependency-free, called by every surface that prints an individual
// total of the viewer's own evaluation (lib/evaluationState.ts canShowMyScore
// for the results page, lib/pdf/cvaFormData.ts for the print page and the PDF).
// Never write the condition anywhere else.
//
// Display only. It never decides a save, a submit, a sync state or
// completeness, nor what the owner sees when deciding on a late evaluation
// (that panel reads the stored score on the server): derived scores are still
// computed and stored on every save exactly as before (lib/evaluation.ts).

export type OwnTotalInput = {
  /** The stored evaluation was sent (isDraft === false). */
  sent: boolean;
};

export function mayShowOwnTotal({ sent }: OwnTotalInput): boolean {
  return sent;
}
