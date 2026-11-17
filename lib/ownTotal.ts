// A-01 / decision 10 (2026-11-16, package F2): a cupper's OWN total is shown
// only for an evaluation that was SENT ("Enviar"; a stored row with
// isDraft === false). "Nobody decides the number and works backwards": while
// the session is open, an unsent draft never shows its total or the arithmetic
// line under it, on the results page, the print page or the CVA PDF. The
// ratings themselves are still shown to their author.
//
// ONE rule, dependency-free, called by every surface that prints an individual
// total of the viewer's own evaluation (lib/evaluationState.ts canShowMyScore
// for the results page, lib/pdf/cvaFormData.ts for the print page and the PDF).
// Never write the condition anywhere else.
//
// Display only. It never decides a save, a submit, a sync state, completeness
// or a stored score: derived scores are still computed and stored on every
// save exactly as before (lib/evaluation.ts).
//
// A draft of a session that is no longer open (closed, or its closing date
// passed) without having been sent keeps today's behaviour on purpose: that
// case is an open question for the owner, not decided here.

export type OwnTotalInput = {
  /** The stored evaluation was sent (isDraft === false). */
  sent: boolean;
  /**
   * The session still takes evaluations: not closed and its closing date not
   * passed (`!isSessionExpired(session)`). Absent is read as OPEN, so a caller
   * that does not know never shows the total of an unsent draft.
   */
  sessionOpen?: boolean;
};

export function mayShowOwnTotal({ sent, sessionOpen }: OwnTotalInput): boolean {
  if (sent) return true;
  // An unsent draft of an open session: never a total (A-01).
  if (sessionOpen ?? true) return false;
  // Unsent, session over: unchanged (question pending for the owner).
  return true;
}
