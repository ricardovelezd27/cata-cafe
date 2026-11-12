// "Usar café existente" on the cup page's sample editor (S9-05, F-express-3).
// Pure, dependency-free rules; the server action (assignSampleCoffee) does the
// authorization, the re-validation of the coffee id and the write.

/** May the owner link an existing coffee to this sample from the cup page?
 *  Owner only, session still writable (not closed, not past `closesAt`) and
 *  the sample has NO coffee yet. Re-linking a sample that already has one is
 *  a product decision and stays out of scope. */
export function canPickExistingCoffee(input: {
  isOwner: boolean;
  writable: boolean;
  sampleCoffeeId: string | null;
}): boolean {
  return input.isOwner && input.writable && input.sampleCoffeeId === null;
}
