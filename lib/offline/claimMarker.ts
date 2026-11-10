// Guest-claim hand-over markers (S8-09, F-guest-5). Two localStorage markers
// carry the hand-over across the sign-in round trip:
//
//   CLAIM_ANON_KEY  {anonId, at}            written by hooks/useGuestClaim.ts when
//                                           the claim starts (before the login page)
//   CLAIM_DONE_KEY  {anonId, accountId, at} written by components/auth/ClaimCard.tsx
//                                           on /auth/claim when confirmGuestClaim
//                                           returned ok, i.e. only after the guest
//                                           signed in and the merge for THAT
//                                           account succeeded
//
// UnsyncedGuardProvider re-keys the anonymous user's drafts only when both exist,
// are fresh, agree on the anonymous id and the signed-in user IS the account that
// confirmed. A guest who abandons the login can therefore never hand their notes
// to whoever signs in on that tablet later. Pure so it can be unit-tested.

export const CLAIM_ANON_KEY = "cata_claim_anon";
export const CLAIM_DONE_KEY = "cata_claim_done";
export const CLAIM_MARKER_TTL_MS = 60 * 60_000;

export type ClaimStarted = { anonId: string; at: number };
export type ClaimDone = { anonId: string; accountId: string; at: number };

function parseJson(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseStarted(raw: string | null | undefined): ClaimStarted | null {
  const v = parseJson(raw);
  if (!v || typeof v.anonId !== "string" || !v.anonId || typeof v.at !== "number") return null;
  return { anonId: v.anonId, at: v.at };
}

export function parseDone(raw: string | null | undefined): ClaimDone | null {
  const v = parseJson(raw);
  if (
    !v ||
    typeof v.anonId !== "string" ||
    !v.anonId ||
    typeof v.accountId !== "string" ||
    !v.accountId ||
    typeof v.at !== "number"
  ) {
    return null;
  }
  return { anonId: v.anonId, accountId: v.accountId, at: v.at };
}

export function serializeStarted(anonId: string, now: number = Date.now()): string {
  return JSON.stringify({ anonId, at: now } satisfies ClaimStarted);
}

export function serializeDone(anonId: string, accountId: string, now: number = Date.now()): string {
  return JSON.stringify({ anonId, accountId, at: now } satisfies ClaimDone);
}

function fresh(at: number, now: number): boolean {
  return now - at >= 0 ? now - at <= CLAIM_MARKER_TTL_MS : false;
}

export type ClaimDecision = {
  /** The anonymous id whose drafts move to `userId`, or null. */
  rekeyFrom: string | null;
  /** Remove both markers now (re-key done, or the start marker is stale/unreadable). */
  clear: boolean;
};

export function decideClaimRekey(input: {
  startedRaw: string | null | undefined;
  doneRaw: string | null | undefined;
  userId: string;
  now: number;
}): ClaimDecision {
  const { startedRaw, doneRaw, userId, now } = input;
  if (!startedRaw && !doneRaw) return { rekeyFrom: null, clear: false };

  const started = parseStarted(startedRaw);
  // Unreadable (including the legacy bare-id format) or expired: drop it.
  if (startedRaw && (!started || !fresh(started.at, now))) {
    return { rekeyFrom: null, clear: true };
  }
  if (!started) {
    // Only a completion marker: stale ones go, a fresh one waits for its start.
    const doneOnly = parseDone(doneRaw);
    return { rekeyFrom: null, clear: !doneOnly || !fresh(doneOnly.at, now) };
  }

  const done = parseDone(doneRaw);
  if (!done) return { rekeyFrom: null, clear: false }; // claim not completed (yet)
  if (!fresh(done.at, now)) return { rekeyFrom: null, clear: true };
  if (done.anonId !== started.anonId) return { rekeyFrom: null, clear: false };
  if (done.accountId !== userId) return { rekeyFrom: null, clear: false };
  if (started.anonId === userId) return { rekeyFrom: null, clear: true };
  return { rekeyFrom: started.anonId, clear: true };
}
