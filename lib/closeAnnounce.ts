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

/** What a cupper sees. "none" = nothing (no announcement, a cancelled one, or
 *  the session already closed); "counting" = time left; "due" = the moment has
 *  passed but the session is not closed yet. */
export type BannerState =
  | { kind: "none" }
  | { kind: "counting"; remainingMs: number }
  | { kind: "due" };

export function bannerState(input: {
  closingAtMs: number | null;
  clientNowMs: number;
  skew: number;
  sessionClosed: boolean;
}): BannerState {
  if (input.sessionClosed || input.closingAtMs === null) return { kind: "none" };
  const left = remainingMs(input.closingAtMs, input.clientNowMs, input.skew);
  return left > 0 ? { kind: "counting", remainingMs: left } : { kind: "due" };
}

/** What the owner's docked line shows. "passed" = the announced moment is over
 *  and the session is still open. */
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
  const s = bannerState(input);
  if (s.kind === "none") return { kind: "none" };
  return s.kind === "counting" ? { kind: "counting", remainingMs: s.remainingMs } : { kind: "passed" };
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
 *  never closes anything: it shows "El cierre anunciado ya pasó". */
export function shouldAutoClose(input: {
  sawTimeLeft: boolean;
  remainingMs: number;
  alreadyTried: boolean;
}): boolean {
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
