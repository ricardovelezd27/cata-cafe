import { describe, expect, it } from "vitest";
import { shouldNotifyAtCreate, shouldNotifyAtStart } from "@/lib/groupNotify";

const base = { isGroup: true, isAsync: false, hasGroup: true, alreadyNotified: false };

describe("shouldNotifyAtStart", () => {
  it("live linked session notifies at start", () => {
    expect(shouldNotifyAtStart(base)).toBe(true);
  });
  it("never twice", () => {
    expect(shouldNotifyAtStart({ ...base, alreadyNotified: true })).toBe(false);
  });
  it("async sessions are not started-notified", () => {
    expect(shouldNotifyAtStart({ ...base, isAsync: true })).toBe(false);
  });
  it("needs a group and a group session", () => {
    expect(shouldNotifyAtStart({ ...base, hasGroup: false })).toBe(false);
    expect(shouldNotifyAtStart({ ...base, isGroup: false })).toBe(false);
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
