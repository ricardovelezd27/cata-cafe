// "Usar café existente" on the cup page's sample editor (S9-05, F-express-3).
// Pure, dependency-free rules; the server action (updateSampleMetadata) and
// cup/page.tsx do the authorization, queries and writes.

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

/** Should cup/page.tsx ship the usable-coffee list at all? Only when at least
 *  one sample could use it, so participants and fully-linked sessions pay no
 *  extra query. */
export function needsCupCoffeePicker(input: {
  isOwner: boolean;
  writable: boolean;
  samples: { coffeeId: string | null }[];
}): boolean {
  return input.samples.some((s) =>
    canPickExistingCoffee({
      isOwner: input.isOwner,
      writable: input.writable,
      sampleCoffeeId: s.coffeeId,
    }),
  );
}
