// A tiny pass runner for the daily cron (S10 leftovers B3). Pure and
// dependency-free: the logger is injected, so it is unit-tested without a
// database. One pass that throws (a failing candidate query, say) is logged with
// a code only, reported as `failed`, and never stops the passes after it.

export type PassResult<T> = { ok: true; value: T } | { ok: false; code: string };

/** The Prisma/system code of a thrown value, else "unknown". Never a message. */
export function passErrorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.length > 0 ? code : "unknown";
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
