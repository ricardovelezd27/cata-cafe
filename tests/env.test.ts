import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REQUIRED_IN_PRODUCTION,
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
  it("super-admin email is recommended, not boot-fatal", () => {
    expect(REQUIRED_IN_PRODUCTION).not.toContain("ANALYTICS_SUPER_ADMIN_EMAIL");
    expect(missingRecommendedEnv(full)).toEqual(["ANALYTICS_SUPER_ADMIN_EMAIL"]);
    expect(missingRecommendedEnv({ ...full, ANALYTICS_SUPER_ADMIN_EMAIL: "a@b.c" })).toEqual([]);
  });
  it("warns once in production when it is unset, silent otherwise", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnRecommendedEnv({ ...full, NODE_ENV: "development" });
    expect(spy).not.toHaveBeenCalled();
    warnRecommendedEnv({ ...full, NODE_ENV: "production" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain("ANALYTICS_SUPER_ADMIN_EMAIL");
    spy.mockClear();
    warnRecommendedEnv({ ...full, NODE_ENV: "production", ANALYTICS_SUPER_ADMIN_EMAIL: "a@b.c" });
    expect(spy).not.toHaveBeenCalled();
  });
});
