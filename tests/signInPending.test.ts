import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SIGNIN_PENDING_COOKIE,
  SIGNIN_PENDING_MAX_VALUE,
  decodePending,
  encodePending,
} from "@/lib/signInPending";

const tokens = { accessToken: "eyJhbGciOi.payload.sig", refreshToken: "refresh-abc" };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");

describe("pending sign-in cookie value (A-08)", () => {
  it("round-trips valid tokens", () => {
    const v = encodePending(tokens);
    expect(v).not.toBeNull();
    expect(decodePending(v)).toEqual(tokens);
  });

  it("is cookie-safe (base64url only)", () => {
    expect(encodePending(tokens)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("treats a missing value as no pending sign-in", () => {
    expect(decodePending(undefined)).toBeNull();
    expect(decodePending(null)).toBeNull();
    expect(decodePending("")).toBeNull();
  });

  it("rejects malformed JSON and non-base64url text", () => {
    expect(decodePending(Buffer.from("{nope", "utf8").toString("base64url"))).toBeNull();
    expect(decodePending("not base64 !!")).toBeNull();
    expect(decodePending("a.b.c")).toBeNull();
  });

  it("rejects the wrong shape", () => {
    expect(decodePending(b64(["a", "r"]))).toBeNull();
    expect(decodePending(b64("text"))).toBeNull();
    expect(decodePending(b64(null))).toBeNull();
    expect(decodePending(b64({ a: "x" }))).toBeNull();
    expect(decodePending(b64({ r: "x" }))).toBeNull();
    expect(decodePending(b64({ a: 1, r: "x" }))).toBeNull();
    expect(decodePending(b64({ a: "x", r: {} }))).toBeNull();
  });

  it("rejects empty tokens", () => {
    expect(decodePending(b64({ a: "", r: "x" }))).toBeNull();
    expect(decodePending(b64({ a: "x", r: "" }))).toBeNull();
    expect(encodePending({ accessToken: "", refreshToken: "x" })).toBeNull();
    expect(encodePending({ accessToken: "x", refreshToken: "" })).toBeNull();
  });

  it("rejects oversized values on both sides", () => {
    const big = "x".repeat(SIGNIN_PENDING_MAX_VALUE);
    expect(encodePending({ accessToken: big, refreshToken: "r" })).toBeNull();
    expect(decodePending("A".repeat(SIGNIN_PENDING_MAX_VALUE + 1))).toBeNull();
    expect(decodePending(b64({ a: "x".repeat(4000), r: "r" }))).toBeNull();
  });
});

describe("wiring: who touches the pending cookie and the ephemeral client", () => {
  const SKIP = new Set(["node_modules", ".next", "generated", ".git", "docs", "tests"]);
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(p.replace(/\\/g, "/"));
    }
    return out;
  }
  const files = ["app", "lib", "components", "hooks", "proxy.ts"].flatMap((f) =>
    statSync(f).isDirectory() ? walk(f) : [f],
  );

  it("only the cookie plumbing and its pure module name the cookie", () => {
    const users = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return src.includes(SIGNIN_PENDING_COOKIE) || src.includes("SIGNIN_PENDING_COOKIE");
    });
    expect(users.sort()).toEqual(["lib/signInPending.ts", "lib/signInPendingCookie.ts"]);
  });

  it("only app/actions/auth.ts imports the pending cookie helpers", () => {
    const users = files.filter((f) => readFileSync(f, "utf8").includes('/signInPendingCookie"'));
    expect(users).toEqual(["app/actions/auth.ts"]);
  });

  const auth = readFileSync("app/actions/auth.ts", "utf8");
  const section = (name: string) => {
    const start = auth.indexOf(`run("${name}"`);
    const rest = auth.slice(start + 1);
    const next = rest.search(/\nexport async function /);
    return auth.slice(start, next === -1 ? undefined : start + 1 + next);
  };

  it("confirmEmailToken verifies on the ephemeral client, never the cookie client", () => {
    const s = section("confirmEmailToken");
    expect(s).toContain("createEphemeralClient()");
    expect(s).toMatch(/ephemeral\.auth\.verifyOtp/);
    expect(s).not.toMatch(/supabase\.auth\.verifyOtp/);
    // The browser session is only established after the intent check.
    expect(s.indexOf("checkSignInIntent")).toBeLessThan(s.indexOf("setSession"));
  });

  it("rejectPendingSignIn never signs out the browser's own session", () => {
    const s = section("rejectPendingSignIn");
    expect(s).not.toContain("createClient()");
    expect(s).toContain('signOut({ scope: "local" })');
    expect(s).toContain("clearPendingSignIn()");
  });
});
