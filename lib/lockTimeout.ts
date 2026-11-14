// S10 WP6 fix round (1): the session-row locks wait at most LOCK_TIMEOUT_MS. Postgres
// answers a lock that cannot be taken in time with SQLSTATE 55P03 ("canceling statement
// due to lock timeout"). Pure and dependency-free: the helpers in lib/sessionLock.ts and
// the shared error mapping (lib/actionResult.ts) both use it.

export const LOCK_TIMEOUT_MS = 5000;
export const LOCK_TIMEOUT_SQLSTATE = "55P03";

/** Does this thrown value mean "a lock wait timed out"? Prisma surfaces a raw-query
 *  failure as a known-request error whose `code` is P2010 and whose `meta.code` is the
 *  SQLSTATE; the pg driver adapter may also put it on `code`, `cause` or only in the
 *  message, so every place is checked. */
export function isLockTimeoutError(err: unknown): boolean {
  const seen = new Set<unknown>();
  const visit = (e: unknown, depth: number): boolean => {
    if (e === null || e === undefined || typeof e !== "object" || depth > 4 || seen.has(e)) return false;
    seen.add(e);
    const o = e as { code?: unknown; message?: unknown; meta?: unknown; cause?: unknown };
    if (o.code === LOCK_TIMEOUT_SQLSTATE) return true;
    if (o.meta && typeof o.meta === "object") {
      const m = o.meta as { code?: unknown; message?: unknown };
      if (m.code === LOCK_TIMEOUT_SQLSTATE) return true;
      if (typeof m.message === "string" && /lock timeout/i.test(m.message)) return true;
    }
    if (typeof o.message === "string" && (o.message.includes(LOCK_TIMEOUT_SQLSTATE) || /lock timeout/i.test(o.message))) {
      return true;
    }
    return visit(o.cause, depth + 1);
  };
  return visit(err, 0);
}
