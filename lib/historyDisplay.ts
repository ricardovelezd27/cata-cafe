// S8-16 (F-sesiones-11, F-express-2). Pure display model for one
// UserCoffeeHistory row. Dependency-free (tests import it).
//
// A row either names a coffee (coffeeId set) or is LABEL-ONLY (coffeeId null):
//   - "unassigned": a closed coffee-less (express) sample;
//   - "unrevealed": a never-revealed sample whose session was deleted. Such a
//     row must never carry anything that identifies the coffee (invariant: a
//     participant cannot learn a blind coffee from their history).
// Label-only rows never link to a coffee page and never count as "a coffee
// tasted" (see isCoffeeRow).

export type HistorySnapshotLike = {
  sessionName?: string;
  sampleLabel?: string;
  cupsPerSample?: number;
  /** Set on label-only rows written for a never-revealed sample. */
  unrevealed?: boolean;
} | null;

export type HistoryRowInput = {
  coffeeId: string | null;
  coffee: { id: string; name: string; deletedAt: Date | null } | null;
  session: { id: string; name: string } | null;
  snapshot: HistorySnapshotLike;
};

export type HistoryDisplay = {
  kind: "coffee" | "label_only";
  /** Only for kind "coffee". */
  coffeeId: string | null;
  /** Raw stored coffee name (caller localizes a deleted coffee); null for label-only. */
  coffeeName: string | null;
  coffeeDeleted: boolean;
  /** Why a label-only row has no coffee; null for kind "coffee". */
  labelReason: "unassigned" | "unrevealed" | null;
  /** The sample's label ("Muestra A"), when known. */
  sampleLabel: string | null;
  /** Null once the session is gone (detached row). */
  sessionId: string | null;
  /** Live session name, else the snapshot's, else null. */
  sessionName: string | null;
  /** True when the row may link to /coffees/<id>. */
  linksToCoffee: boolean;
};

/** A row that counts as "a coffee tasted" / belongs in per-coffee aggregates. */
export function isCoffeeRow(row: { coffeeId: string | null }): boolean {
  return row.coffeeId !== null;
}

export function historyDisplay(row: HistoryRowInput): HistoryDisplay {
  const sessionId = row.session?.id ?? null;
  const sessionName = row.session?.name ?? row.snapshot?.sessionName ?? null;
  const sampleLabel = row.snapshot?.sampleLabel ?? null;

  if (row.coffeeId === null || row.coffee === null) {
    return {
      kind: "label_only",
      coffeeId: null,
      coffeeName: null,
      coffeeDeleted: false,
      labelReason: row.snapshot?.unrevealed === true ? "unrevealed" : "unassigned",
      sampleLabel,
      sessionId,
      sessionName,
      linksToCoffee: false,
    };
  }

  const coffeeDeleted = row.coffee.deletedAt !== null;
  return {
    kind: "coffee",
    coffeeId: row.coffee.id,
    coffeeName: row.coffee.name,
    coffeeDeleted,
    labelReason: null,
    sampleLabel,
    sessionId,
    sessionName,
    linksToCoffee: !coffeeDeleted,
  };
}
