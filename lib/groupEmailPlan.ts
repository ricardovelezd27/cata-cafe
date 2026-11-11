// Pure rules for sending one group broadcast (S8-03, F-grupos-7). No Prisma, no
// fetch: the ledger read/write and the Resend calls live in lib/groupEmail.ts.
// Nothing here ever holds or returns a raw address.

import type { SendEmailErrorCode } from "@/lib/email";

export type DeliveryStatus = "sent" | "skipped" | "failed";

export const MAX_SEND_ATTEMPTS = 3;
/** Recipients sent in parallel (same bound as the close-email fan-out). */
export const SEND_CONCURRENCY = 4;
const BASE_BACKOFF_MS = 400;
/** A Retry-After above this is not waited for inside a request. */
const MAX_BACKOFF_MS = 5_000;

export type LedgerRow = { memberId: string; status: string };

/** A failure worth retrying inside the request: rate limited, provider error
 *  or network. A 4xx (bad address, unverified domain) will not get better. */
export function isRetryable(code: SendEmailErrorCode | undefined): boolean {
  return code === "resend_429" || code === "resend_5xx" || code === "network";
}

/** Wait before attempt `attempt + 1` (attempt is 1-based, the one that just
 *  failed): exponential with up to 50% jitter, never below the provider's
 *  Retry-After, never above MAX_BACKOFF_MS. `random` is injectable for tests. */
export function backoffMs(
  attempt: number,
  retryAfterMs?: number,
  random: () => number = Math.random,
): number {
  const exp = BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1);
  const jittered = exp * (1 + 0.5 * random());
  const wanted = Math.max(jittered, retryAfterMs ?? 0);
  return Math.min(Math.round(wanted), MAX_BACKOFF_MS);
}

/** Splits a broadcast into who still needs a send and who already got it.
 *  A recipient with a `sent` row is never sent twice; `skipped` and `failed`
 *  rows are retried. `isRetry` is true only when EVERY recipient still to be
 *  sent already has a ledger row (any status) for this broadcast. The id is
 *  client-supplied, so a call that reaches even one recipient new to the
 *  ledger is a fresh broadcast and must take a broadcast slot. */
export function planBroadcast<T extends { memberId: string }>(
  recipients: readonly T[],
  ledger: readonly LedgerRow[],
  /** Members who unsubscribed from this group's mail (S8-20). Dropped from
   *  `toSend` BEFORE the budget is reserved, so they cost the sender nothing
   *  and "retry failed" never reaches them. A member who already got this
   *  broadcast stays `alreadySent`. */
  optedOut: ReadonlySet<string> = new Set(),
): { toSend: T[]; alreadySent: T[]; optedOut: T[]; isRetry: boolean } {
  const sent = new Set(ledger.filter((r) => r.status === "sent").map((r) => r.memberId));
  const seen = new Set<string>();
  const toSend: T[] = [];
  const alreadySent: T[] = [];
  const dropped: T[] = [];
  for (const r of recipients) {
    if (seen.has(r.memberId)) continue; // never twice per broadcast
    seen.add(r.memberId);
    if (sent.has(r.memberId)) alreadySent.push(r);
    else if (optedOut.has(r.memberId)) dropped.push(r);
    else toSend.push(r);
  }
  const known = new Set(ledger.map((r) => r.memberId));
  const isRetry = toSend.length > 0 && toSend.every((r) => known.has(r.memberId));
  return { toSend, alreadySent, optedOut: dropped, isRetry };
}

export function summarize<R extends { status: DeliveryStatus }>(
  results: readonly R[],
): { attempted: number; sent: number; skipped: number; failed: number; results: R[] } {
  return {
    attempted: results.length,
    sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results: [...results],
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A client-supplied broadcast id is accepted only if it is a uuid. */
export function isBroadcastId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type AttemptOutcome = {
  ok: boolean;
  skipped?: boolean;
  code?: SendEmailErrorCode;
  retryAfterMs?: number;
};

/** Sends one recipient with bounded retries. `send` and `sleep` are injected so
 *  the policy is testable; the caller uses the same idempotency key for every
 *  attempt of one call (a retried request must not deliver twice). */
export async function sendWithRetry(
  send: () => Promise<AttemptOutcome>,
  sleep: (ms: number) => Promise<void>,
  random: () => number = Math.random,
): Promise<{ status: DeliveryStatus; attempts: number; code?: string }> {
  let attempts = 0;
  for (;;) {
    attempts += 1;
    let out: AttemptOutcome;
    try {
      out = await send();
    } catch {
      out = { ok: false, code: "network" };
    }
    if (out.skipped) return { status: "skipped", attempts };
    if (out.ok) return { status: "sent", attempts };
    if (attempts >= MAX_SEND_ATTEMPTS || !isRetryable(out.code)) {
      return { status: "failed", attempts, code: out.code ?? "unknown" };
    }
    await sleep(backoffMs(attempts, out.retryAfterMs, random));
  }
}

/** Resend idempotency key for one recipient at one attempt generation. The
 *  generation is the ledger's attempts before this call, so a manual retry
 *  after a failure is a NEW key (a failed request's key can be cached). */
export function idempotencyKeyFor(broadcastId: string, memberId: string, priorAttempts: number): string {
  return `${broadcastId}:${memberId}:${priorAttempts}`;
}
