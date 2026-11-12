import { describe, expect, it } from "vitest";
import {
  notifyAtStartFlag,
  notifyFlagAfterGroupChange,
  noticeOutcome,
  shouldNotifyAtCreate,
  shouldNotifyAtStart,
} from "@/lib/groupNotify";

const base = { isGroup: true, isAsync: false, hasGroup: true, alreadyNotified: false };
const startBase = { ...base, notifyGroupAtStart: true, startFlipped: true };

describe("shouldNotifyAtStart", () => {
  it("live linked session that asked to notify notifies at start", () => {
    expect(shouldNotifyAtStart(startBase)).toBe(true);
  });
  it("never twice", () => {
    expect(shouldNotifyAtStart({ ...startBase, alreadyNotified: true })).toBe(false);
  });
  it("async sessions are not started-notified", () => {
    expect(shouldNotifyAtStart({ ...startBase, isAsync: true })).toBe(false);
  });
  it("needs a group and a group session", () => {
    expect(shouldNotifyAtStart({ ...startBase, hasGroup: false })).toBe(false);
    expect(shouldNotifyAtStart({ ...startBase, isGroup: false })).toBe(false);
  });
  it("a session created before the flag existed (false) never notifies", () => {
    expect(shouldNotifyAtStart({ ...startBase, notifyGroupAtStart: false })).toBe(false);
  });
  it("a second start call (not flipped) never notifies", () => {
    expect(shouldNotifyAtStart({ ...startBase, startFlipped: false })).toBe(false);
  });
});

describe("noticeOutcome", () => {
  it("everyone failed -> failed (stamp released)", () => {
    expect(noticeOutcome({ sent: 0, failed: 3 })).toBe("failed");
  });
  it("some sent, some failed -> partial", () => {
    expect(noticeOutcome({ sent: 2, failed: 1 })).toBe("partial");
  });
  it("all sent or nothing failed -> sent", () => {
    expect(noticeOutcome({ sent: 3, failed: 0 })).toBe("sent");
    expect(noticeOutcome({ sent: 0, failed: 0 })).toBe("sent");
  });
  it("opted-out recipients (skipped) are neither sent nor failed", () => {
    expect(noticeOutcome({ sent: 0, failed: 0, skipped: 3 })).not.toBe("failed");
    expect(noticeOutcome({ sent: 2, failed: 0, skipped: 1 })).toBe("sent");
    expect(noticeOutcome({ sent: 0, failed: 1, skipped: 2 })).toBe("failed");
  });
});

describe("shouldNotifyAtCreate", () => {
  it("async linked session notifies at creation", () => {
    expect(shouldNotifyAtCreate({ ...base, isAsync: true })).toBe(true);
  });
  it("live sessions wait for the start", () => {
    expect(shouldNotifyAtCreate(base)).toBe(false);
  });
  it("not when already notified or unlinked", () => {
    expect(shouldNotifyAtCreate({ ...base, isAsync: true, alreadyNotified: true })).toBe(false);
    expect(shouldNotifyAtCreate({ ...base, isAsync: true, hasGroup: false })).toBe(false);
  });

  // C8: the owner of a LIVE session may ask for the notice at creation.
  it("live session: notifies at creation only when the owner chose 'create'", () => {
    expect(shouldNotifyAtCreate({ ...base, notifyWhen: "create" })).toBe(true);
    expect(shouldNotifyAtCreate({ ...base, notifyWhen: "start" })).toBe(false);
    expect(shouldNotifyAtCreate({ ...base })).toBe(false); // default = start
  });
  it("async session ignores the choice: always at creation", () => {
    expect(shouldNotifyAtCreate({ ...base, isAsync: true, notifyWhen: "start" })).toBe(true);
    expect(shouldNotifyAtCreate({ ...base, isAsync: true, notifyWhen: "create" })).toBe(true);
  });
  it("'create' still needs a group, a group session and no earlier notice", () => {
    expect(shouldNotifyAtCreate({ ...base, notifyWhen: "create", hasGroup: false })).toBe(false);
    expect(shouldNotifyAtCreate({ ...base, notifyWhen: "create", isGroup: false })).toBe(false);
    expect(shouldNotifyAtCreate({ ...base, notifyWhen: "create", alreadyNotified: true })).toBe(false);
  });
});

describe("notifyAtStartFlag (C8)", () => {
  const f = { hasGroup: true, notify: true, isAsync: false };
  it("true only for a live, linked, ticked session whose owner chose 'start' (default)", () => {
    expect(notifyAtStartFlag(f)).toBe(true);
    expect(notifyAtStartFlag({ ...f, notifyWhen: "start" })).toBe(true);
    expect(notifyAtStartFlag({ ...f, notifyWhen: "create" })).toBe(false);
    expect(notifyAtStartFlag({ ...f, isAsync: true })).toBe(false);
    expect(notifyAtStartFlag({ ...f, notify: false })).toBe(false);
    expect(notifyAtStartFlag({ ...f, hasGroup: false })).toBe(false);
  });
  it("never both at creation and at start for one choice", () => {
    for (const notifyWhen of ["create", "start"] as const) {
      for (const isAsync of [false, true]) {
        const create = shouldNotifyAtCreate({ ...base, isAsync, notifyWhen });
        const start = notifyAtStartFlag({ ...f, isAsync, notifyWhen });
        expect(create && start).toBe(false);
      }
    }
  });
});

describe("notifyFlagAfterGroupChange", () => {
  it("changing or removing the group clears the flag", () => {
    expect(notifyFlagAfterGroupChange("A", "B")).toBe(false);
    expect(notifyFlagAfterGroupChange("A", null)).toBe(false);
    expect(notifyFlagAfterGroupChange(null, "B")).toBe(false);
  });
  it("an unchanged group leaves the flag alone", () => {
    expect(notifyFlagAfterGroupChange("A", "A")).toBeUndefined();
    expect(notifyFlagAfterGroupChange(null, null)).toBeUndefined();
  });
});
