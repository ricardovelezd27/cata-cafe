// A tiny pass runner for the daily cron (S10 leftovers B3). Pure and
// dependency-free: the logger is injected, so it is unit-tested without a
// database. One pass that throws (a failing candidate query, say) is logged with
// a code only, reported as `failed`, and never stops the passes after it.

export type PassResult<T> = { ok: true; value: T } | { ok: false; code: string };

/**
 * What to log for a thrown value, never its message: a string `code`, else a
 * string `errorCode` (Prisma connection errors carry it), else the error's
 * constructor name, else "unknown".
 */
export function passErrorCode(err: unknown): string {
  if (err === null || typeof err !== "object") return "unknown";
  const { code, errorCode } = err as { code?: unknown; errorCode?: unknown };
  if (typeof code === "string" && code.length > 0) return code;
  if (typeof errorCode === "string" && errorCode.length > 0) return errorCode;
  const name = (err as { constructor?: { name?: unknown } }).constructor?.name;
  return typeof name === "string" && name.length > 0 && name !== "Object" ? name : "unknown";
}

export type CronFlags = {
  closeFailed: boolean;
  repairFailed: boolean;
  remindersFailed: boolean;
  idlePassFailed: boolean;
  reconcileFailed: boolean;
};

/**
 * The HTTP status of a cron run. The deadline-close and repair passes are the
 * ones that matter (a session not closed or not repaired): when either failed
 * the run is RED (500, `ok: false`) so the cron shows it, but the later passes
 * still ran and the full summary is still returned. Reminders, the idle pass
 * and the reconcile are best effort: a failure keeps 200 and its own flag.
 */
export function cronStatus(f: CronFlags): { ok: boolean; httpStatus: 200 | 500 } {
  return f.closeFailed || f.repairFailed ? { ok: false, httpStatus: 500 } : { ok: true, httpStatus: 200 };
}

export async function runPass<T>(
  name: string,
  fn: () => Promise<T>,
  onFailure: (name: string, code: string) => void,
): Promise<PassResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const code = passErrorCode(err);
    try {
      onFailure(name, code);
    } catch {
      // a failing logger must not take the run down either
    }
    return { ok: false, code };
  }
}
