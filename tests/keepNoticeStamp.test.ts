import { describe, expect, it } from "vitest";
import { keepNoticeStamp } from "@/lib/groupNotify";

describe("S8-28 D-09 keepNoticeStamp", () => {
  it("keeps the claim when the group was reached (sent or partial)", () => {
    expect(keepNoticeStamp({ sent: 5, failed: 0 })).toBe(true);
    expect(keepNoticeStamp({ sent: 3, failed: 2 })).toBe(true);
  });

  it("keeps the claim when everyone opted out (skipped is not a failure)", () => {
    expect(keepNoticeStamp({ sent: 0, failed: 0, skipped: 4 })).toBe(true);
  });

  it("releases the claim when nobody was reached or the send threw/was refused", () => {
    expect(keepNoticeStamp({ sent: 0, failed: 4 })).toBe(false);
    expect(keepNoticeStamp(null)).toBe(false);
  });
});
