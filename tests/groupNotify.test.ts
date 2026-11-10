import { describe, expect, it } from "vitest";
import { noticeOutcome, shouldNotifyAtCreate, shouldNotifyAtStart } from "@/lib/groupNotify";

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
});
