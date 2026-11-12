import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REQUIRED_IN_PRODUCTION,
  RECOMMENDED_IN_PRODUCTION,
  assertProductionEnv,
  missingProductionEnv,
  missingRecommendedEnv,
  warnRecommendedEnv,
} from "@/lib/env";

const full = Object.fromEntries(REQUIRED_IN_PRODUCTION.map((n) => [n, "x"]));

afterEach(() => vi.restoreAllMocks());

describe("production env", () => {
  it("names every missing required variable", () => {
    expect(missingProductionEnv({})).toEqual([...REQUIRED_IN_PRODUCTION]);
    expect(missingProductionEnv(full)).toEqual([]);
    expect(missingProductionEnv({ ...full, CRON_SECRET: "  " })).toEqual(["CRON_SECRET"]);
  });
  it("super-admin email is required; only UNSUBSCRIBE_SECRET is recommended", () => {
    expect(REQUIRED_IN_PRODUCTION).toContain("ANALYTICS_SUPER_ADMIN_EMAIL");
    expect(REQUIRED_IN_PRODUCTION).not.toContain("UNSUBSCRIBE_SECRET");
    expect([...RECOMMENDED_IN_PRODUCTION]).toEqual(["UNSUBSCRIBE_SECRET"]);
    expect(missingRecommendedEnv(full)).toEqual(["UNSUBSCRIBE_SECRET"]);
    expect(missingRecommendedEnv({ ...full, UNSUBSCRIBE_SECRET: "s" })).toEqual([]);
  });
  it("a production env without the super-admin email (or with a blank one) fails the boot", () => {
    const { ANALYTICS_SUPER_ADMIN_EMAIL: _omit, ...rest } = full;
    void _omit;
    expect(missingProductionEnv(rest)).toEqual(["ANALYTICS_SUPER_ADMIN_EMAIL"]);
    expect(() => assertProductionEnv({ ...rest, NODE_ENV: "production" })).toThrow(
      /ANALYTICS_SUPER_ADMIN_EMAIL/,
    );
    expect(() =>
      assertProductionEnv({ ...full, ANALYTICS_SUPER_ADMIN_EMAIL: "  ", NODE_ENV: "production" }),
    ).toThrow(/ANALYTICS_SUPER_ADMIN_EMAIL/);
    expect(() => assertProductionEnv({ ...full, NODE_ENV: "production" })).not.toThrow();
  });
  it("in development a missing super-admin email only warns", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertProductionEnv({ NODE_ENV: "development" })).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });
  it("warns once in production when the recommended variable is unset, silent otherwise", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnRecommendedEnv({ ...full, NODE_ENV: "development" });
    expect(spy).not.toHaveBeenCalled();
    warnRecommendedEnv({ ...full, NODE_ENV: "production" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain("UNSUBSCRIBE_SECRET");
    spy.mockClear();
    warnRecommendedEnv({ ...full, NODE_ENV: "production", UNSUBSCRIBE_SECRET: "s" });
    expect(spy).not.toHaveBeenCalled();
  });
});
