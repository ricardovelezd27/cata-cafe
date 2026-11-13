// "Datos de origen editados el {fecha}" (S10 WP5a, F-cafes-9; answer D1).
//
// A coffee's origin data is LIVE: a past session, its results page and its
// reports always read the coffee's current values. That is only honest if a
// reader can tell the data moved after the session closed, so every surface that
// shows origin data of a closed session carries one note, from this one rule.
//
// Two things can change origin data after the close:
//  - the sample's own origin record (`extrinsic_data.edited_at`, stamped by
//    upsertExtrinsic only when the session is over), and
//  - the linked coffee itself (`coffees.updatedAt`).
// Pure and dependency-free. TODO(kim-validar:D1)

type MaybeDate = Date | null | undefined;

/** The latest origin edit that happened strictly after the session closed, or
 *  null. `extrinsicEditedAt` is only ever stamped post-close, so it counts as
 *  soon as it exists (and, when the close time is known, only if it is after
 *  it); the coffee's `updatedAt` counts only when the close time is known and
 *  strictly earlier. */
export function originEditedAfterClose(input: {
  closedAt: MaybeDate;
  extrinsicEditedAt?: MaybeDate;
  coffeeUpdatedAt?: MaybeDate;
}): Date | null {
  const closed = input.closedAt ? input.closedAt.getTime() : null;
  let latest: Date | null = null;
  const consider = (d: MaybeDate, needsClose: boolean) => {
    if (!d) return;
    if (closed === null ? needsClose : d.getTime() <= closed) return;
    if (!latest || d.getTime() > latest.getTime()) latest = d;
  };
  consider(input.extrinsicEditedAt, false);
  consider(input.coffeeUpdatedAt, true);
  return latest;
}
