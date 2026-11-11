import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CODE_VERIFY_PER_IP,
  CODE_VERIFY_PER_TARGET,
  decideAll,
  decideThrottle,
} from "@/lib/emailLimits";

// S8-22 A-03 / A-04. These rules count ATTEMPTS, not failures.
const MIN = 60_000;
const NOW = 10_000_000_000;
const ev = (agoMs: number) => ({ at: NOW - agoMs, recipients: 0 });
const none = { recipients: 0 };

describe("code_verify rules", () => {
  it("per target: 10 attempts / 15 min, the 11th is refused with a wait", () => {
    expect(CODE_VERIFY_PER_TARGET).toEqual({ windowMs: 15 * MIN, maxEvents: 10 });
    const nine = Array.from({ length: 9 }, (_, i) => ev((i + 1) * MIN));
    expect(decideThrottle(nine, CODE_VERIFY_PER_TARGET, none, NOW)).toEqual({ allowed: true });
    const ten = Array.from({ length: 10 }, (_, i) => ev((i + 1) * MIN));
    const d = decideThrottle(ten, CODE_VERIFY_PER_TARGET, none, NOW);
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.retryAfterMs).toBe(5 * MIN); // oldest is 10 min old
  });

  it("per IP: 120 attempts / 15 min", () => {
    expect(CODE_VERIFY_PER_IP).toEqual({ windowMs: 15 * MIN, maxEvents: 120 });
    const full = Array.from({ length: 120 }, () => ev(MIN));
    expect(decideThrottle(full, CODE_VERIFY_PER_IP, none, NOW).allowed).toBe(false);
    expect(decideThrottle(full.slice(1), CODE_VERIFY_PER_IP, none, NOW).allowed).toBe(true);
  });

  it("attempts older than the window do not count", () => {
    const old = Array.from({ length: 50 }, () => ev(16 * MIN));
    expect(decideAll([{ events: old, rule: CODE_VERIFY_PER_TARGET }], none, NOW)).toEqual({ allowed: true });
  });
});

describe("wiring: reserve before Supabase is called", () => {
  const src = readFileSync("app/actions/auth.ts", "utf8");
  const section = (name: string) => src.slice(src.indexOf(`run("${name}"`));

  it("verifyEmailCode reserves a code_verify attempt before verifyOtp", () => {
    const s = section("verifyEmailCode");
    expect(s.indexOf('kind: "code_verify"')).toBeGreaterThan(-1);
    expect(s.indexOf('kind: "code_verify"')).toBeLessThan(s.indexOf("verifyOtp"));
  });
  it("confirmEmailToken reserves (keyed by a token hash) before verifyOtp", () => {
    const s = section("confirmEmailToken");
    expect(s.indexOf('kind: "code_verify"')).toBeGreaterThan(-1);
    expect(s.indexOf("createHash")).toBeGreaterThan(-1);
    expect(s.indexOf('kind: "code_verify"')).toBeLessThan(s.indexOf("verifyOtp"));
  });
  it("requestEmailChange reserves a magic_link send for the NEW address before updateUser", () => {
    const s = section("requestEmailChange");
    const r = s.indexOf('kind: "magic_link"');
    expect(r).toBeGreaterThan(-1);
    expect(s.slice(r, r + 120)).toContain("email: address");
    expect(r).toBeLessThan(s.indexOf("updateUser"));
  });
});
