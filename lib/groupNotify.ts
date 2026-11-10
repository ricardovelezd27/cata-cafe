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

/** Async group session linked to a group: send at creation. */
export function shouldNotifyAtCreate(i: NotifyRuleInput): boolean {
  return i.isGroup && i.isAsync && i.hasGroup && !i.alreadyNotified;
}
