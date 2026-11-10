import { describe, expect, it } from "vitest";
import { loginErrorFromParam, mapAuthError } from "@/lib/authErrors";

describe("mapAuthError", () => {
  it("maps every rate-limit spelling to one key (landing and login agree)", () => {
    for (const c of ["rate_limited", "over_email_send_rate_limit", "over_request_rate_limit", "Email rate limit exceeded"]) {
      expect(mapAuthError(c)).toBe("rate_limited");
    }
  });
  it("maps invalid input, bad codes, cancel and link failures", () => {
    expect(mapAuthError("email_address_invalid")).toBe("invalid_email");
    expect(mapAuthError("missing_email")).toBe("invalid_email");
    expect(mapAuthError("otp_expired")).toBe("code_invalid");
    expect(mapAuthError("access_denied")).toBe("cancelled");
    expect(mapAuthError("exchange_failed")).toBe("link_failed");
    expect(mapAuthError("Failed to fetch")).toBe("unreachable");
  });
  it("falls back to unknown", () => {
    expect(mapAuthError(undefined)).toBe("unknown");
    expect(mapAuthError("something_new")).toBe("unknown");
  });
  it("passes its own keys through", () => {
    expect(mapAuthError("cancelled")).toBe("cancelled");
  });
});

describe("loginErrorFromParam", () => {
  it("only understands known params and ignores the rest", () => {
    expect(loginErrorFromParam("exchange_failed")).toBe("link_failed");
    expect(loginErrorFromParam("access_denied")).toBe("cancelled");
    expect(loginErrorFromParam("<script>")).toBeNull();
    expect(loginErrorFromParam(undefined)).toBeNull();
  });
});
