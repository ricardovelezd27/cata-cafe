import { describe, expect, it } from "vitest";
import { localDateISO } from "../lib/localDate";

describe("localDateISO", () => {
  it("uses the local calendar, zero-padded", () => {
    expect(localDateISO(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
    expect(localDateISO(new Date(2026, 10, 10, 0, 5))).toBe("2026-11-10");
  });
  it("does not roll to the UTC day late in the evening", () => {
    // 23:59 local is still the same local day whatever the UTC offset.
    const lateEvening = new Date(2026, 5, 15, 23, 59);
    expect(localDateISO(lateEvening)).toBe("2026-06-15");
  });
});
