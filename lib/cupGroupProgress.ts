// What the /cup page may tell a viewer about how many cuppers have submitted
// (S10 WP4a review, Kim C5; TODO(kim-validar:C5)). "3 de 5 enviados" is group
// information: before the session closes only the owner may see it, so a
// participant's props must carry neither the number nor the formatted line.
// Pure: the page calls it, tests/cupGroupProgress.test.ts pins it.

export type CupGroupProgress = {
  /** 0 for everyone but the owner. */
  submittedCount: number;
  /** The server-formatted "3 de 5 enviados" line; "" for everyone but the owner. */
  submittedOf: string;
};

export function cupGroupProgressForViewer(input: {
  /** The signed-in viewer and the session's owner (`createdBy`): the helper
   *  decides ownership itself, so a caller cannot pass a literal `true`. */
  viewerId: string;
  ownerId: string;
  done: number;
  total: number;
  /** Formats the line (the page's translator); only called for the owner. */
  format: (done: number, total: number) => string;
}): CupGroupProgress {
  if (input.viewerId !== input.ownerId) return { submittedCount: 0, submittedOf: "" };
  return { submittedCount: input.done, submittedOf: input.format(input.done, input.total) };
}
