// When does the group get the "new session" email? (S8-17, C8 default b)
// Pure and dependency-free so it is unit-tested.
//
//  - ASYNC session (has a closing date, never "started"): at creation.
//  - LIVE session: when the owner starts it, so members are not told about a
//    cupping that may be days away and then forgotten.
// `alreadyNotified` makes both paths idempotent (double click, second entry
// point, resend after a partial failure).

export type NotifyRuleInput = {
  isGroup: boolean;
  isAsync: boolean;
  hasGroup: boolean;
  alreadyNotified: boolean;
};

export type NotifyAtStartInput = NotifyRuleInput & {
  /** The owner ticked "notify the group" when creating the session. False for
   *  sessions created before the column existed and after a group change. */
  notifyGroupAtStart: boolean;
  /** THIS call flipped `startedAt` (a second start call must not send). */
  startFlipped: boolean;
};

/** Live group session linked to a group: send from `startSession`. ONE rule. */
export function shouldNotifyAtStart(i: NotifyAtStartInput): boolean {
  return (
    i.isGroup &&
    !i.isAsync &&
    i.hasGroup &&
    i.notifyGroupAtStart &&
    !i.alreadyNotified &&
    i.startFlipped
  );
}

export type NoticeOutcome = "sent" | "partial" | "failed";

/** How a finished send looks to the owner. `notifyGroupOfSession` is `ok`
 *  even when every recipient failed; only the summary tells. Nothing sent but
 *  something failed -> "failed" (release the stamp so it can be resent); some
 *  sent and some failed -> "partial" (keep the stamp; retry from the group).
 *  Opted-out members (S8-20) are ledgered as `skipped`: neither sent nor
 *  failed, so a send where everyone opted out is NOT "failed". */
export function noticeOutcome(summary: { sent: number; failed: number; skipped?: number }): NoticeOutcome {
  if (summary.failed > 0) return summary.sent > 0 ? "partial" : "failed";
  return "sent";
}

/** S8-28 D-09: `notifyGroupOfSession` claims `groupNotifiedAt` itself (so a
 *  direct call cannot repeat the notice) and calls this to decide, after the
 *  send, whether the claim stays. A send that threw/was refused (`null`) or
 *  reached nobody ("failed") releases it so the owner can resend; "sent" and
 *  "partial" keep it (partial retries from the group page). */
export function keepNoticeStamp(summary: { sent: number; failed: number; skipped?: number } | null): boolean {
  return summary !== null && noticeOutcome(summary) !== "failed";
}

/** Async group session linked to a group: send at creation. */
export function shouldNotifyAtCreate(i: NotifyRuleInput): boolean {
  return i.isGroup && i.isAsync && i.hasGroup && !i.alreadyNotified;
}

/** `updateSession` group edit: a tick made for group A must never email group B.
 *  Returns the new flag, or `undefined` to leave it untouched (same group). */
export function notifyFlagAfterGroupChange(
  storedGroupId: string | null,
  nextGroupId: string | null,
): false | undefined {
  return storedGroupId === nextGroupId ? undefined : false;
}
