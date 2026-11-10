// Atomic daily-question slot for the insights chat (S8-14, F-insights-6).
// The quota used to be READ before the model loop and INCREMENTED after it, so
// N parallel questions all read the same count and all ran (a cost leak on a
// paid model). Now the slot is RESERVED before the loop with a conditional
// increment (`questionCount < limit`), and released if no model call succeeded
// ("not billed if no call succeeded" is unchanged).
//
// Dependency-free: the Prisma-backed store lives in app/actions/aiChat.ts, a
// fake one drives tests/chatQuota.test.ts.

export interface ChatQuotaStore {
  /** Make sure today's row exists with questionCount 0. Must tolerate a
   *  concurrent create (unique violation) as success. */
  ensureRow(): Promise<void>;
  /** Atomic: increment questionCount only while it is below `limit`.
   *  Returns the number of rows changed (1 = slot taken, 0 = full). */
  tryIncrement(limit: number): Promise<number>;
  /** Give a slot back (never below zero). */
  decrement(): Promise<void>;
}

/** Reserves one question slot. `false` means the daily limit is reached. */
export async function reserveQuestionSlot(
  store: ChatQuotaStore,
  limit: number,
): Promise<boolean> {
  await store.ensureRow();
  return (await store.tryIncrement(limit)) === 1;
}

/** Releases a reserved slot (provider failed before any successful call). */
export async function releaseQuestionSlot(store: ChatQuotaStore): Promise<void> {
  await store.decrement();
}
