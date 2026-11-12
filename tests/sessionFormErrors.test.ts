import { describe, expect, it } from "vitest";
import { fieldErrorId, fieldForErrorCode, fieldInputId } from "@/lib/sessionFormErrors";

describe("fieldForErrorCode", () => {
  it("maps field-level codes", () => {
    expect(fieldForErrorCode("invalid_name")).toBe("name");
    expect(fieldForErrorCode("invalid_date")).toBe("date");
    expect(fieldForErrorCode("invalid_closes_at")).toBe("closesAt");
    expect(fieldForErrorCode("invalid_cups")).toBe("cups");
  });
  it("leaves non-field codes in the strip", () => {
    for (const c of ["missing_coffee_fields", "invalid_altitude", "unknown", "offline", "constructor", "", null, undefined]) {
      expect(fieldForErrorCode(c)).toBeNull();
    }
  });
  it("builds stable ids", () => {
    expect(fieldInputId("name")).toBe("session-field-name");
    expect(fieldErrorId("name")).toBe("session-field-name-error");
  });
});
