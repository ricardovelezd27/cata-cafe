/**
 * The capture tool (scripts/ux-capture) reads only. These are its safety rules, which are pure
 * functions in lib/guard.mjs and lib/plan.mjs. The tool's local environment is the PRODUCTION
 * database, so each rule is pinned here, together with a scan of the committed plans.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GuardError,
  LOCAL_HOSTNAMES,
  TEST_ADDRESSES,
  assertLocalBase,
  assertTestAddress,
  buildTargetUrl,
  isLocalHostname,
  isReadOnlyMethod,
  shouldBlockWebSocket,
  signInUrl,
} from "../scripts/ux-capture/lib/guard.mjs";
import { captureName, orderScreens, parsePlanSpecs, resolveTokens, validatePlan } from "../scripts/ux-capture/lib/plan.mjs";

const TOOL = join(__dirname, "..", "scripts", "ux-capture");

describe("assertLocalBase: only localhost, 127.0.0.1 and [::1]", () => {
  it.each([
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://localhost", "http://localhost"],
    ["http://127.0.0.1:3100/some/path?x=1#y", "http://127.0.0.1:3100"],
    ["http://[::1]:3000", "http://[::1]:3000"],
    ["http://LOCALHOST:3000/", "http://localhost:3000"],
    ["https://localhost:8443", "https://localhost:8443"],
  ])("accepts %s", (input, origin) => {
    expect(assertLocalBase(input)).toBe(origin);
  });

  it.each([
    "https://cafesensible.ai",
    "https://cata-cafe.vercel.app",
    "http://localhost.evil.com",
    "http://127.0.0.1.evil.com",
    "http://evil.com/localhost",
    "http://localhost@evil.com",
    "http://user:pass@localhost:3000",
    "http://localhost.:3000",
    "http://192.168.1.20:3000",
    "http://0.0.0.0:3000",
    "http://[::2]:3000",
    "ftp://localhost",
    "file:///C:/x",
    "localhost:3000",
    "not a url",
    "",
  ])("refuses %s", (input) => {
    expect(() => assertLocalBase(input)).toThrow(GuardError);
  });

  it("names the host it refuses and says why", () => {
    expect(() => assertLocalBase("https://example.com")).toThrow(/example\.com/);
    expect(() => assertLocalBase("https://example.com")).toThrow(/production database/);
  });

  it("isLocalHostname lists exactly the three loopback names", () => {
    expect(LOCAL_HOSTNAMES).toEqual(["localhost", "127.0.0.1", "[::1]"]);
    expect(isLocalHostname("localhost")).toBe(true);
    expect(isLocalHostname("example.com")).toBe(false);
  });
});

describe("isReadOnlyMethod: every write is aborted in the browser", () => {
  it.each(["GET", "get", "HEAD", "OPTIONS"])("lets %s through", (m) => expect(isReadOnlyMethod(m)).toBe(true));
  it.each(["POST", "PUT", "PATCH", "DELETE", "post", "TRACE", "CONNECT", "", undefined, null])("aborts %s", (m) => expect(isReadOnlyMethod(m)).toBe(false));
});

describe("shouldBlockWebSocket: only the dev server's own hot-reload socket may connect", () => {
  const origin = "http://localhost:3000";

  it.each([
    "ws://localhost:3000/_next/webpack-hmr",
    "ws://localhost:3000/_next/webpack-hmr?id=abc&x=1",
    "ws://LOCALHOST:3000/_next/webpack-hmr",
    "ws://localhost:3000/_next/static/hmr-1.x/socket",
  ])("lets %s through (same host and port, ws for http, under /_next/)", (url) => {
    expect(shouldBlockWebSocket(url, origin)).toBe(false);
  });

  it("follows the base: https is wss, another loopback host and port are their own", () => {
    expect(shouldBlockWebSocket("wss://localhost:8443/_next/webpack-hmr", "https://localhost:8443")).toBe(false);
    expect(shouldBlockWebSocket("ws://localhost:8443/_next/webpack-hmr", "https://localhost:8443")).toBe(true);
    expect(shouldBlockWebSocket("wss://localhost:8443/_next/webpack-hmr", "http://localhost:8443")).toBe(true);
    expect(shouldBlockWebSocket("ws://127.0.0.1:3100/_next/webpack-hmr", "http://127.0.0.1:3100")).toBe(false);
    expect(shouldBlockWebSocket("ws://[::1]:3000/_next/webpack-hmr", "http://[::1]:3000")).toBe(false);
    expect(shouldBlockWebSocket("ws://localhost/_next/webpack-hmr", "http://localhost")).toBe(false);
  });

  it.each([
    ["Supabase Realtime", "wss://abcdefgh.supabase.co/realtime/v1/websocket?apikey=x&vsn=1.0.0"],
    ["another host", "wss://example.com/_next/webpack-hmr"],
    ["another loopback name for the same machine", "ws://127.0.0.1:3000/_next/webpack-hmr"],
    ["the same host on another port", "ws://localhost:3001/_next/webpack-hmr"],
    ["the same host, port omitted", "ws://localhost/_next/webpack-hmr"],
    ["the wrong scheme for an http base", "wss://localhost:3000/_next/webpack-hmr"],
    ["an http URL", "http://localhost:3000/_next/webpack-hmr"],
    ["any other path", "ws://localhost:3000/api/health"],
    ["the root path", "ws://localhost:3000/"],
    ["a path that only starts like /_next", "ws://localhost:3000/_nextx/webpack-hmr"],
    ["the prefix itself, no file", "ws://localhost:3000/_next"],
    ["a dot-dot segment", "ws://localhost:3000/_next/../api/health"],
    ["a percent-encoded dot-dot segment", "ws://localhost:3000/_next/%2e%2e/api/health"],
    ["a double-encoded dot-dot segment", "ws://localhost:3000/_next/%252e%252e/api/health"],
    ["an encoded slash", "ws://localhost:3000/_next/..%2fapi/health"],
    ["a backslash", "ws://localhost:3000/_next/..\\api/health"],
    ["a look-alike host", "ws://localhost.evil.test:3000/_next/webpack-hmr"],
    ["a look-alike host with a prefix", "ws://evil-localhost:3000/_next/webpack-hmr"],
    ["a userinfo trick (host is evil.test)", "ws://localhost:3000@evil.test/_next/webpack-hmr"],
    ["userinfo on the real host", "ws://user:pass@localhost:3000/_next/webpack-hmr"],
    ["a trailing-dot host", "ws://localhost.:3000/_next/webpack-hmr"],
  ])("closes %s", (_what, url) => {
    expect(shouldBlockWebSocket(url, origin)).toBe(true);
  });

  it.each(["not even a url", "", undefined, null, 42])("fails closed on %s", (url) => {
    expect(shouldBlockWebSocket(url, origin)).toBe(true);
  });

  it("fails closed when the base itself is not a URL", () => {
    expect(shouldBlockWebSocket("ws://localhost:3000/_next/webpack-hmr", "")).toBe(true);
    expect(shouldBlockWebSocket("ws://localhost:3000/_next/webpack-hmr", "ftp://localhost:3000")).toBe(true);
  });

  it("the capture opens its context through routeWebSocket with this rule, counts both outcomes, and connects only behind it", () => {
    const src = readFileSync(join(TOOL, "capture.mjs"), "utf8");
    expect(src).toContain("ctx.routeWebSocket(");
    expect(src).toContain("shouldBlockWebSocket(ws.url(), origin)");
    expect(src).toContain("blockedSockets");
    expect(src).toContain("allowedSockets");
    expect(src.match(/connectToServer\(/g)).toHaveLength(1); // only behind the rule, never on its own
  });

  it("a capture waits for the page to hydrate and records it", () => {
    const src = readFileSync(join(TOOL, "capture.mjs"), "utf8");
    expect(src).toContain("waitForFunction(isHydrated");
    expect(src).toContain("hydrated,");
  });
});

describe("sign-in: only the three seeded test addresses, only through the dev GET route", () => {
  it("allows exactly the three addresses of the dev route", () => {
    expect(TEST_ADDRESSES).toEqual(["master@cata.test", "par1@cata.test", "par2@cata.test"]);
    const route = readFileSync(join(__dirname, "..", "app", "api", "dev", "sign-in", "route.ts"), "utf8");
    for (const a of TEST_ADDRESSES) expect(route).toContain(`"${a}"`);
  });

  it("accepts a test address, normalised", () => {
    expect(assertTestAddress("  Master@Cata.Test ")).toBe("master@cata.test");
  });

  it.each(["someone@example.com", "master@cata.test.evil.com", "x@cata.test", "", undefined])("refuses %s", (a) => {
    expect(() => assertTestAddress(a as string)).toThrow(GuardError);
  });

  it("builds a GET URL on the given origin and nothing else", () => {
    expect(signInUrl("http://localhost:3000", "par1@cata.test")).toBe("http://localhost:3000/api/dev/sign-in?email=par1%40cata.test&next=%2Fes%2Fapp");
    expect(() => signInUrl("http://localhost:3000", "not-a-test@example.com")).toThrow(GuardError);
    expect(() => signInUrl("http://localhost:3000", "par1@cata.test", "//evil.com")).toThrow(GuardError);
    expect(() => signInUrl("http://localhost:3000", "par1@cata.test", "https://evil.com")).toThrow(GuardError);
  });
});

describe("buildTargetUrl: a plan can only name a path on the host it runs against", () => {
  const origin = "http://localhost:3000";
  it("joins locale and path", () => {
    expect(buildTargetUrl(origin, "es", "/app/sessions")).toBe("http://localhost:3000/es/app/sessions");
    expect(buildTargetUrl(origin, "en", "")).toBe("http://localhost:3000/en");
  });
  it.each(["app", "//evil.com", "/\\evil.com", "/a\nb", "https://evil.com", "@evil.com"])("refuses the path %j", (p) => {
    expect(() => buildTargetUrl(origin, "es", p)).toThrow(GuardError);
  });
  it("refuses a locale that is not two letters", () => {
    expect(() => buildTargetUrl(origin, "es/..", "/x")).toThrow(GuardError);
    expect(() => buildTargetUrl(origin, "", "/x")).toThrow(GuardError);
  });
  it("never leaves the origin, whatever a path holds", () => {
    for (const p of ["/a/../../b", "/a%2f..%2f", "/@evil.com", "/x?next=https://evil.com"]) {
      expect(new URL(buildTargetUrl(origin, "es", p)).origin).toBe(origin);
    }
  });
});

describe("plan helpers", () => {
  it("resolveTokens fills {{tokens}} from local ids and reports a missing or odd one", () => {
    expect(resolveTokens("/app/sessions/{{closed}}/results", { closed: "abc-123_X" })).toEqual({ path: "/app/sessions/abc-123_X/results", missing: [] });
    expect(resolveTokens("/app/sessions/{{closed}}", {}).missing).toEqual(["closed"]);
    expect(resolveTokens("/x/{{a}}", { a: "../evil" }).missing).toEqual(["a"]);
    expect(resolveTokens("/x/{{a}}", { a: "" }).missing).toEqual(["a"]);
    expect(resolveTokens("/app", {})).toEqual({ path: "/app", missing: [] });
  });

  it("orderScreens runs the cup page (phase 1) and the badge (phase 2) last, otherwise in order", () => {
    const s = [{ id: "a", phase: 1 }, { id: "b" }, { id: "c", phase: 2 }, { id: "d", phase: 0 }, { id: "e", phase: 1 }];
    expect(orderScreens(s).map((x) => x.id)).toEqual(["b", "d", "a", "e", "c"]);
  });

  it("parsePlanSpecs reads name and optional address", () => {
    expect(parsePlanSpecs("owner=master@cata.test, visitor")).toEqual([
      { name: "owner", email: "master@cata.test" },
      { name: "visitor", email: null },
    ]);
  });

  it("captureName is <id>.<device>.<lang>[.<state>]", () => {
    expect(captureName({ id: "app" }, "small", "es")).toBe("app.small.es");
    expect(captureName({ id: "app", state: "empty" }, "desktop", "en")).toBe("app.desktop.en.empty");
  });

  it("validatePlan accepts a good plan and names what is wrong in a bad one", () => {
    const good = { name: "x", signIn: false, screens: [{ id: "a", path: "/a", steps: [{ click: "text=Hi" }, { wait: 5 }] }] };
    expect(validatePlan(good)).toEqual([]);
    expect(validatePlan({ ...good, signIn: undefined })).not.toEqual([]);
    expect(validatePlan({ ...good, screens: [{ id: "A", path: "a" }] }).length).toBe(2);
    expect(validatePlan({ ...good, screens: [{ id: "a", path: "/a", steps: [{ click: "x", wait: 1 }] }] })).not.toEqual([]);
    expect(validatePlan({ ...good, screens: [{ id: "a", path: "/a", eval: "1", evalFile: "x" }] })).not.toEqual([]);
  });
});

describe("the committed plans and files hold nothing private", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? (f === "node_modules" || f === "out" ? [] : files(p)) : [p];
    });
  const committed = files(TOOL).filter((f) => !/package-lock\.json$|local\.json$/.test(f) || /local\.example\.json$/.test(f));

  it("every plan is valid", () => {
    for (const name of readdirSync(join(TOOL, "plans"))) {
      const plan = JSON.parse(readFileSync(join(TOOL, "plans", name), "utf8"));
      expect(validatePlan(plan), name).toEqual([]);
      expect(`${plan.name}.json`).toBe(name);
    }
  });

  it("no real-looking session / coffee / group id (cuid or uuid), except the all-zero invalid token", () => {
    const cuid = /\b(?:c[a-z0-9]{24}|c[a-z0-9]{20,23})\b/;
    const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
    for (const f of committed.filter((x) => /\.(json|md|js|mjs)$/.test(x))) {
      const text = readFileSync(f, "utf8");
      expect(cuid.test(text), `${f}: looks like a cuid`).toBe(false);
      for (const u of text.match(uuid) ?? []) expect(u, `${f}: uuid`).toBe("00000000-0000-0000-0000-000000000000");
    }
  });

  it("no email address other than the three seeded test addresses (and the example placeholder)", () => {
    const email = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g; // no trailing "." of a sentence
    const allowed = new Set([...TEST_ADDRESSES, "persona@ejemplo.com"]);
    for (const f of committed.filter((x) => /\.(json|md|js|mjs)$/.test(x))) {
      for (const e of readFileSync(f, "utf8").match(email) ?? []) expect(allowed.has(e.toLowerCase()), `${f}: ${e}`).toBe(true);
    }
  });

  it("local.json (real ids, name list) and the output folder are ignored by git", () => {
    const ignore = readFileSync(join(__dirname, "..", ".gitignore"), "utf8");
    expect(ignore).toContain("/scripts/ux-capture/local.json");
    expect(ignore).toContain("/scripts/ux-capture/out/");
    expect(ignore).toContain("/scripts/ux-capture/node_modules");
  });
});
