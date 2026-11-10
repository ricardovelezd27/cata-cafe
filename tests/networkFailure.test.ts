import { describe, expect, it } from "vitest";
import { ACTION_ERROR_CODES, isActionErrorCode, isNetworkFailure } from "@/lib/actionResult";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

describe("isNetworkFailure (F-04-3)", () => {
  it("is true when the browser reports offline, whatever was thrown", () => {
    expect(isNetworkFailure(new Error("boom"), false)).toBe(true);
  });
  it("recognises a dropped fetch", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"), true)).toBe(true);
    expect(isNetworkFailure(new TypeError("Load failed"), true)).toBe(true);
    expect(isNetworkFailure(new TypeError("NetworkError when attempting to fetch resource."))).toBe(true);
  });
  it("leaves real failures as unknown", () => {
    expect(isNetworkFailure(new Error("invalid_input"), true)).toBe(false);
    expect(isNetworkFailure(new TypeError("x is not a function"), true)).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
  });
});

describe("offline code", () => {
  it("is a known code with copy in both languages", () => {
    expect(isActionErrorCode("offline")).toBe(true);
    for (const code of ACTION_ERROR_CODES) {
      expect((es.errors.codes as Record<string, string>)[code]).toBeTruthy();
      expect((en.errors.codes as Record<string, string>)[code]).toBeTruthy();
    }
  });
});
