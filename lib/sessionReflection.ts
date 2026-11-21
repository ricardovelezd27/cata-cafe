// OR-D (the owner's review of 2026-11-21): ONE reflection per tasting and person,
// written after the session closed. It replaces the note per coffee. Pure rules
// (no Prisma, no Next, no React), shared by the action, the results page and the
// tests.
//
// The notes written per coffee before this change stay stored
// (`Evaluation.postCloseNote`) and are shown read-only. A tasting has one kind or
// the other, never both: while any note per coffee exists in a session, nobody
// writes a reflection about it.

import * as v from "@/lib/validate";

/** Max characters of a reflection. */
export const SESSION_REFLECTION_MAX = 500;

/** The text to store, or null for "clear it". Throws `invalid_input` for a
 *  non-string or a text over `SESSION_REFLECTION_MAX` characters. */
export function normalizeReflection(text: unknown): string | null {
  return v.str(text, "text", { max: SESSION_REFLECTION_MAX, required: false });
}

/** A person may write (or clear) their reflection about a CLOSED session they
 *  SENT at least one evaluation in, unless the session holds notes per coffee. */
export function reflectionAllowed(input: {
  sessionStatus: string;
  /** How many evaluations this person submitted in the session. */
  sentEvaluations: number;
  /** How many evaluations of the session (anyone's) carry a note per coffee. */
  coffeeNotes: number;
}): boolean {
  return input.sessionStatus === "closed" && input.sentEvaluations > 0 && input.coffeeNotes === 0;
}

export type MyReflection = { text: string | null; at: string | null };
export type CupperReflection = { text: string; at: string | null };

export type ReflectionsPayload = {
  /** The viewer's own reflection (text null = not written yet); null when they may not write one. */
  mine: MyReflection | null;
  /** The organizer only: every OTHER person's reflection, by cupper id. null otherwise. */
  byCupper: Record<string, CupperReflection> | null;
};

/** Who reads a reflection: the person who wrote it and the session's organizer.
 *  Never another participant, never a report or the CSV. A participant gets
 *  `byCupper: null` and only their own row, whatever rows are passed in. */
export function buildReflections(input: {
  sessionStatus: string;
  /** The session's organizer (never the admin's read-only lens). */
  organizer: boolean;
  viewerId: string;
  viewerSent: number;
  coffeeNotes: number;
  rows: readonly { userId: string; text: string; writtenAt: Date }[];
}): ReflectionsPayload {
  if (input.sessionStatus !== "closed") return { mine: null, byCupper: null };
  const own = input.rows.find((r) => r.userId === input.viewerId);
  const mine = reflectionAllowed({
    sessionStatus: input.sessionStatus,
    sentEvaluations: input.viewerSent,
    coffeeNotes: input.coffeeNotes,
  })
    ? { text: own?.text ?? null, at: own ? own.writtenAt.toISOString() : null }
    : null;
  if (!input.organizer) return { mine, byCupper: null };
  const byCupper: Record<string, CupperReflection> = {};
  for (const r of input.rows) {
    if (r.userId !== input.viewerId) byCupper[r.userId] = { text: r.text, at: r.writtenAt.toISOString() };
  }
  return { mine, byCupper };
}

export type OwnerNote = {
  key: string;
  /** Who wrote it and, for a note per coffee, which sample. */
  heading: string;
  text: string;
  at: string | null;
};

/**
 * The organizer's ONE notes block: the notes per coffee of a tasting from before
 * the reflection, as they are, or the reflections. Never both lists (a tasting
 * with notes per coffee takes no reflection). null when nobody else wrote.
 */
export function ownerNotesBlock(input: {
  /** cupper id -> sample id -> note (the organizer's payload only). */
  coffeeNotes: Readonly<Record<string, Readonly<Record<string, CupperReflection>>>> | null | undefined;
  /** cupper id -> reflection (the organizer's payload only). */
  reflections: Readonly<Record<string, CupperReflection>> | null | undefined;
  cupperNames: Readonly<Record<string, string>>;
  sampleLabels: Readonly<Record<string, string>>;
}): { kind: "coffee" | "reflection"; items: OwnerNote[] } | null {
  const perCoffee = Object.entries(input.coffeeNotes ?? {}).flatMap(([cupperId, bySample]) =>
    Object.entries(bySample).map(([sampleId, note]) => ({
      key: `${cupperId}:${sampleId}`,
      who: input.cupperNames[cupperId] ?? "",
      sample: input.sampleLabels[sampleId] ?? "",
      note,
    })),
  );
  if (perCoffee.length > 0) {
    perCoffee.sort((a, b) => a.who.localeCompare(b.who) || a.sample.localeCompare(b.sample));
    return {
      kind: "coffee",
      items: perCoffee.map((i) => ({ key: i.key, heading: `${i.who} · ${i.sample}`, text: i.note.text, at: i.note.at })),
    };
  }
  const items = Object.entries(input.reflections ?? {})
    .map(([cupperId, r]) => ({ key: cupperId, heading: input.cupperNames[cupperId] ?? "", text: r.text, at: r.at }))
    .sort((a, b) => a.heading.localeCompare(b.heading));
  return items.length > 0 ? { kind: "reflection", items } : null;
}
