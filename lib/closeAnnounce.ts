// S10 WP4b (Kim C1, `TODO(kim-validar:C1)`): the owner announces the close a few
// minutes ahead. Pure rules (no React, no Prisma) shared by the owner's dialog
// and docked line, the cuppers' banner and the server action.
//
// The announced moment is `CuppingSession.closingAt`. It is DISPLAY state only:
// nothing on the server closes at that instant. The owner's open cup page calls
// the existing `closeSession` when its countdown reaches zero; if that page is
// not open then, nothing closes and the owner finds "El cierre anunciado ya
// pasó" on return. A closed session's `closingAt` is history and is never shown.
//
// Clock skew is handled like the synced warm-up run: the page ships the
// server's `serverNow`, the client keeps `skew = serverNow - clientNow` and
// every comparison uses `clientNow + skew` (lib/warmup/syncedRun.ts has the
// same helpers; they are re-used, not copied).

import { parseDbTimestamp, skewMs } from "@/lib/warmup/syncedRun";

export { parseDbTimestamp, skewMs };

/** The only lead times the owner can choose. */
export const ANNOUNCE_MINUTES = [2, 5] as const;
export type AnnounceMinutes = (typeof ANNOUNCE_MINUTES)[number];

export function isAnnounceMinutes(value: unknown): value is AnnounceMinutes {
  return typeof value === "number" && (ANNOUNCE_MINUTES as readonly number[]).includes(value);
}

/** The moment to store for an announcement made at `nowMs` (server clock). */
export function closingAtFor(nowMs: number, minutes: AnnounceMinutes): Date {
  return new Date(nowMs + minutes * 60_000);
}

/** Milliseconds until the announced close on the SERVER's clock (negative once
 *  passed). `skew` = serverNow - clientNow at the time the page was rendered. */
export function remainingMs(closingAtMs: number, clientNowMs: number, skew: number): number {
  return closingAtMs - (clientNowMs + skew);
}

/** How long past zero the cupper's banner keeps saying "está por cerrar", and how long
 *  after that it says the announced close did not happen (S10 WP4b review L1). */
export const DUE_WINDOW_MS = 2 * 60_000;
export const NOT_DONE_WINDOW_MS = 10 * 60_000;

/** What a cupper sees. "none" = nothing (no announcement, a cancelled one, the
 *  session already closed, or the announcement is older than both windows);
 *  "counting" = time left; "due" = the moment passed (at most 2 minutes ago) and
 *  the session is not closed; "notDone" = it passed 2 to 12 minutes ago and the
 *  session is still open ("El cierre anunciado no se hizo"). */
export type BannerState =
  | { kind: "none" }
  | { kind: "counting"; remainingMs: number }
  | { kind: "due" }
  | { kind: "notDone" };

export function bannerState(input: {
  closingAtMs: number | null;
  clientNowMs: number;
  skew: number;
  sessionClosed: boolean;
}): BannerState {
  if (input.sessionClosed || input.closingAtMs === null) return { kind: "none" };
  const left = remainingMs(input.closingAtMs, input.clientNowMs, input.skew);
  if (left > 0) return { kind: "counting", remainingMs: left };
  const past = -left;
  if (past <= DUE_WINDOW_MS) return { kind: "due" };
  if (past <= DUE_WINDOW_MS + NOT_DONE_WINDOW_MS) return { kind: "notDone" };
  return { kind: "none" };
}

/** What the owner's docked line shows. "passed" = the announced moment is over
 *  and the session is still open (stays until the owner closes or cancels). */
export type OwnerLineState =
  | { kind: "none" }
  | { kind: "counting"; remainingMs: number }
  | { kind: "passed" };

export function ownerLineState(input: {
  closingAtMs: number | null;
  clientNowMs: number;
  skew: number;
  sessionClosed: boolean;
}): OwnerLineState {
  if (input.sessionClosed || input.closingAtMs === null) return { kind: "none" };
  const left = remainingMs(input.closingAtMs, input.clientNowMs, input.skew);
  return left > 0 ? { kind: "counting", remainingMs: left } : { kind: "passed" };
}

/** Whole minutes to read out, rounded UP, never below 1 while time is left.
 *  The cuppers' banner text only changes when this changes, so an
 *  `aria-live="polite"` region announces at most once per minute. */
export function minuteBucket(remaining: number): number {
  if (remaining <= 0) return 0;
  return Math.max(1, Math.ceil(remaining / 60_000));
}

/** The owner's page closes the session by itself ONLY when it watched the
 *  countdown run out: at some earlier tick of THIS page load time was left
 *  (`sawTimeLeft`), and now it is over. A page opened after the moment passed
 *  never closes anything: it shows "El cierre anunciado ya pasó". Never while a cancel
 *  is in flight or after the owner clicked "Cancelar". The server re-checks all of it
 *  (`closeAnnounced`); this only keeps a stale tab quiet. */
export function shouldAutoClose(input: {
  sawTimeLeft: boolean;
  remainingMs: number;
  alreadyTried: boolean;
  /** A cancel (or another request) is in flight. */
  busy?: boolean;
  /** The owner clicked "Cancelar" for this announcement. */
  cancelled?: boolean;
}): boolean {
  if (input.busy === true || input.cancelled === true) return false;
  return input.sawTimeLeft && !input.alreadyTried && input.remainingMs <= 0;
}

/** "m:ss" for the owner's line. */
export function formatClock(remaining: number): string {
  const total = Math.max(0, Math.ceil(remaining / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** The closing moment out of a realtime row or a prop. `undefined` = the row
 *  does not carry the column (leave the state alone), `null` = cleared. */
export function closingAtFromRow(row: Record<string, unknown>): number | null | undefined {
  const has = "closingAt" in row || "closing_at" in row;
  if (!has) return undefined;
  const raw = row.closingAt ?? row.closing_at;
  if (raw === null || raw === undefined) return null;
  return parseDbTimestamp(raw);
}
