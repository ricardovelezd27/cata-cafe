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

/** C8 (S10 WP2): when the owner of a LIVE group session (no closing date) wants
 *  the linked group emailed. Async sessions have no start, so they always
 *  notify at creation and ignore this. Default = "start" (the S8-17 rule).
 *  TODO(kim-validar:C8): simulated answer (Kim: "que el profesor elija"). */
export const NOTIFY_WHEN = ["create", "start"] as const;
export type NotifyWhen = (typeof NOTIFY_WHEN)[number];
export const DEFAULT_NOTIFY_WHEN: NotifyWhen = "start";

/** Send from `createGroupSession` when the session is ASYNC, or LIVE and the
 *  owner chose "create". `alreadyNotified` keeps it idempotent. */
export function shouldNotifyAtCreate(i: NotifyRuleInput & { notifyWhen?: NotifyWhen }): boolean {
  const when = i.notifyWhen ?? DEFAULT_NOTIFY_WHEN;
  return i.isGroup && i.hasGroup && !i.alreadyNotified && (i.isAsync || when === "create");
}

/** The value stored in `CuppingSession.notifyGroupAtStart` at creation: true
 *  only for a LIVE session linked to a group, with "notify" ticked, whose
 *  owner chose "start". A live session notified at creation never waits for
 *  the start (and `groupNotifiedAt` stops a later start from sending twice). */
export function notifyAtStartFlag(i: {
  hasGroup: boolean;
  notify: boolean;
  isAsync: boolean;
  notifyWhen?: NotifyWhen;
}): boolean {
  const when = i.notifyWhen ?? DEFAULT_NOTIFY_WHEN;
  return i.hasGroup && i.notify && !i.isAsync && when === "start";
}

/** `updateSession` group edit: a tick made for group A must never email group B.
 *  Returns the new flag, or `undefined` to leave it untouched (same group). */
export function notifyFlagAfterGroupChange(
  storedGroupId: string | null,
  nextGroupId: string | null,
): false | undefined {
  return storedGroupId === nextGroupId ? undefined : false;
}
