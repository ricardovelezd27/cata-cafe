import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The pure half of the guest → account "claim" (S8-07, F-guest-8): the signed
 * token, the safe return path and the evaluation conflict rule. No Prisma, no
 * `server-only`, so vitest covers them (tests/guestClaimToken.test.ts). The
 * merge itself stays in lib/guestClaim.ts.
 *
 * The token is stateless (HMAC over {anonymous id, iat, exp}); replay is
 * harmless because the anonymous user no longer exists after the first
 * successful claim, which mergeGuestData checks before touching anything.
 */

// Long on purpose: the token only travels in the guest's own URL/email, the
// merge is gated by an explicit confirmation AND the source still being an
// anonymous user, and a magic link re-sent days later must still redeem it.
// RISK (F-guest-9, accepted): it is a bearer token, so anyone who gets the
// URL within 7 days and signs in can offer to absorb the guest's data. The
// confirmation card (name + counts, never a merge on GET) and the
// still-anonymous check are the mitigations; see docs/flows.md.
export const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ClaimPayload = { a: string; iat: number; exp: number };

function claimSecret(): string {
  const secret = process.env.GUEST_CLAIM_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("guest_claim_secret_missing");
  return secret;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", claimSecret()).update(payloadB64).digest("base64url");
}

export function mintGuestClaimToken(anonymousUserId: string, now = Date.now()): string {
  const payload: ClaimPayload = { a: anonymousUserId, iat: now, exp: now + CLAIM_TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export type VerifiedClaim = { anonymousUserId: string; issuedAt: Date; expired: boolean };

/** Null for a malformed or tampered token; `expired: true` for a genuine but stale one. */
export function verifyGuestClaimToken(token: string, now = Date.now()): VerifiedClaim | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: ClaimPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as ClaimPayload;
  } catch {
    return null;
  }
  if (typeof payload.a !== "string" || typeof payload.exp !== "number" || typeof payload.iat !== "number") {
    return null;
  }
  return { anonymousUserId: payload.a, issuedAt: new Date(payload.iat), expired: now > payload.exp };
}

/** Only ever bounce back into the app on this origin. */
export function safeClaimBack(locale: string, back: string | undefined): string {
  const loc = locale === "en" ? "en" : "es";
  return back && back.startsWith(`/${loc}/app/`) ? back : `/${loc}/app`;
}

export type ClaimEvalRow = {
  id: string;
  sessionSampleId: string;
  isDraft: boolean;
  submittedAt: Date | null;
  updatedAt: Date;
};

/** Which of two evaluations of the same sample survives a merge: a submitted
 * one beats a draft; among equals, the most recent. */
export function anonEvalWins(anonRow: ClaimEvalRow, targetRow: ClaimEvalRow): boolean {
  if (anonRow.isDraft !== targetRow.isDraft) return !anonRow.isDraft;
  const a = (anonRow.submittedAt ?? anonRow.updatedAt).getTime();
  const b = (targetRow.submittedAt ?? targetRow.updatedAt).getTime();
  return a > b;
}

/** Conflict resolution for one merge: for each (guest, account) pair on the same
 * sample, which evaluation is deleted, and which of those belong to the ACCOUNT.
 * The account's label-only history rows for the latter must be dropped too
 * (S8-16): the guest's label row is moved over, so keeping both would leave the
 * account with two label rows for one sample. */
export function resolveEvalConflicts(
  pairs: { anon: ClaimEvalRow; target: ClaimEvalRow }[],
): { deleteIds: string[]; accountLoserIds: string[] } {
  const deleteIds: string[] = [];
  const accountLoserIds: string[] = [];
  for (const { anon, target } of pairs) {
    if (anonEvalWins(anon, target)) {
      deleteIds.push(target.id);
      accountLoserIds.push(target.id);
    } else {
      deleteIds.push(anon.id);
    }
  }
  return { deleteIds, accountLoserIds };
}

export type RefireInput = {
  guestExcluded: boolean;
  guestHadRow: boolean;
  accountExcluded: boolean;
  accountHadRow: boolean;
  guestHasEvaluations: boolean;
};

/** Whether a session's stored aggregate must be re-fired after a merge. The
 * surviving account row carries the OR of both exclusion flags. Moved guest
 * evaluations were counted under the guest's flag (false with no row) and now
 * sit under the surviving flag; the account's own evaluations were counted
 * under the account's flag and now sit under it too. Any change in who the
 * trigger counts needs a re-fire. */
export function needsAggregateRefire(i: RefireInput): boolean {
  const guestFlag = i.guestHadRow && i.guestExcluded;
  const accountFlag = i.accountHadRow && i.accountExcluded;
  const surviving = guestFlag || accountFlag;
  if (i.guestHasEvaluations && surviving !== guestFlag) return true;
  // Pre-existing rule: both identities had rows and the guest's exclusion
  // flipped the account's own flag.
  return i.accountHadRow && i.guestHadRow && surviving !== accountFlag;
}
