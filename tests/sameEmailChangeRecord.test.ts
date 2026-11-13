import { describe, expect, it } from "vitest";
import { EMAIL_CHANGE_KEY, sameEmailChangeRecord } from "@/lib/emailChangeRules";

const rec = (from: unknown, to: unknown) => ({ [EMAIL_CHANGE_KEY]: { from, to } });

describe("sameEmailChangeRecord (clear only the record the decision was made on)", () => {
  it("equal from and to (normalised) are the same record", () => {
    expect(sameEmailChangeRecord(rec("O@e.test", "n@e.test"), rec(" o@e.test", "N@e.test"))).toBe(true);
  });
  it("a changed to or from, a missing or malformed record is not the same", () => {
    expect(sameEmailChangeRecord(rec("o@e.test", "n@e.test"), rec("o@e.test", "x@e.test"))).toBe(false);
    expect(sameEmailChangeRecord(rec("o@e.test", "n@e.test"), rec("z@e.test", "n@e.test"))).toBe(false);
    expect(sameEmailChangeRecord(rec("o@e.test", "n@e.test"), {})).toBe(false);
    expect(sameEmailChangeRecord(rec("o@e.test", "n@e.test"), { [EMAIL_CHANGE_KEY]: null })).toBe(false);
    expect(sameEmailChangeRecord({}, {})).toBe(false);
    expect(sameEmailChangeRecord(null, null)).toBe(false);
  });
  it("two records that are both unusable are still compared by raw value (a malformed record that did not change is the same)", () => {
    expect(sameEmailChangeRecord({ [EMAIL_CHANGE_KEY]: "x" }, { [EMAIL_CHANGE_KEY]: "x" })).toBe(true);
    expect(sameEmailChangeRecord({ [EMAIL_CHANGE_KEY]: "x" }, { [EMAIL_CHANGE_KEY]: "y" })).toBe(false);
    expect(sameEmailChangeRecord(rec(1, 2), rec(1, 2))).toBe(true);
    expect(sameEmailChangeRecord(rec(1, 2), rec(1, 3))).toBe(false);
  });
});
