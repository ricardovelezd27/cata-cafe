// "Datos de origen editados el {fecha}" (S10 WP5a, F-cafes-9; answer D1).
//
// A coffee's origin data is LIVE: a past session, its results page and its
// reports always read the coffee's current values. That is only honest if a
// reader can tell the data moved after the session stopped being writable, so
// every surface that shows origin data of a closed session carries one note, from
// this one rule.
//
// Two things can change origin data after that moment:
//  - the sample's own origin record (`extrinsic_data.edited_at`, stamped by
//    upsertExtrinsic only when the session is over), and
//  - the linked coffee's ORIGIN fields (`coffees.originEditedAt`, stamped only
//    when an origin field really changes: lib/coffeeOrigin.ts). NEVER
//    `coffees.updatedAt`, which also moves on publish, visibility, invites...
// Pure and dependency-free. TODO(kim-validar:D1)

type MaybeDate = Date | null | undefined;

/** The moment the session stopped being writable: the earlier of `closedAt` and a
 *  `closesAt` that has already passed (an origin edit made while the session was
 *  expired but not yet closed still counts). Null while it is still writable. */
export function stoppedWritingAt(input: {
  closedAt: MaybeDate;
  closesAt?: MaybeDate;
  now?: Date;
}): Date | null {
  const now = (input.now ?? new Date()).getTime();
  const candidates = [input.closedAt, input.closesAt && input.closesAt.getTime() <= now ? input.closesAt : null]
    .filter((d): d is Date => !!d)
    .map((d) => d.getTime());
  return candidates.length ? new Date(Math.min(...candidates)) : null;
}

/** The latest origin edit that happened strictly after the session stopped being
 *  writable, or null. `extrinsicEditedAt` is only ever stamped post-close, so it
 *  counts as soon as it exists (and, when the cut-off is known, only if after it);
 *  the coffee's `originEditedAt` counts only when the cut-off is known and strictly
 *  earlier. */
export function originEditedAfterClose(input: {
  closedAt: MaybeDate;
  closesAt?: MaybeDate;
  now?: Date;
  extrinsicEditedAt?: MaybeDate;
  coffeeOriginEditedAt?: MaybeDate;
}): Date | null {
  const cutoff = stoppedWritingAt(input);
  const closed = cutoff ? cutoff.getTime() : null;
  let latest: Date | null = null;
  const consider = (d: MaybeDate, needsCutoff: boolean) => {
    if (!d) return;
    if (closed === null ? needsCutoff : d.getTime() <= closed) return;
    if (!latest || d.getTime() > latest.getTime()) latest = d;
  };
  consider(input.extrinsicEditedAt, false);
  consider(input.coffeeOriginEditedAt, true);
  return latest;
}

/** The coffee profile's session list and the coffee ficha: the same note, from the
 *  same rule as the results page (S10 WP6 B3). The row carries both moments, so a
 *  coffee edit made between a passed `closesAt` and the later `closedAt` counts. */
export function coffeeSessionOriginEditedAt(input: {
  sessionClosedAt: MaybeDate;
  sessionClosesAt?: MaybeDate;
  coffeeOriginEditedAt: MaybeDate;
  now?: Date;
}): Date | null {
  return originEditedAfterClose({
    closedAt: input.sessionClosedAt,
    closesAt: input.sessionClosesAt,
    now: input.now,
    coffeeOriginEditedAt: input.coffeeOriginEditedAt,
  });
}

/** The results page / report note for ONE sample: only a revealed sample says it. */
export function sampleOriginEditedAt(input: {
  revealed: boolean;
  closedAt: MaybeDate;
  closesAt?: MaybeDate;
  now?: Date;
  extrinsicEditedAt?: MaybeDate;
  coffeeOriginEditedAt?: MaybeDate;
}): Date | null {
  return input.revealed ? originEditedAfterClose(input) : null;
}
