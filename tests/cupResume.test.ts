import { describe, expect, it } from "vitest";
import { resumeCallbackRefreshes } from "@/lib/cupResume";

describe("resumeCallbackRefreshes", () => {
  it("solo sessions never refetch on resume", () => {
    for (const isOwner of [true, false]) {
      for (const online of [true, false]) {
        expect(resumeCallbackRefreshes({ isGroup: false, isOwner, online })).toBe(false);
      }
    }
  });
  it("an online group owner leaves the refresh to the channel's SUBSCRIBED re-seed", () => {
    expect(resumeCallbackRefreshes({ isGroup: true, isOwner: true, online: true })).toBe(false);
  });
  it("an offline group owner refreshes itself (the realtime effect returns early)", () => {
    expect(resumeCallbackRefreshes({ isGroup: true, isOwner: true, online: false })).toBe(true);
  });
  it("group participants always refresh on resume", () => {
    expect(resumeCallbackRefreshes({ isGroup: true, isOwner: false, online: true })).toBe(true);
    expect(resumeCallbackRefreshes({ isGroup: true, isOwner: false, online: false })).toBe(true);
  });
});
