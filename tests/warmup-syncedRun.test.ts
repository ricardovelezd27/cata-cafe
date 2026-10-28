import { describe, expect, it } from "vitest";
import {
  formatTimeLeft,
  isMissed,
  isRunning,
  parseDbTimestamp,
  runLengthMs,
  seekFor,
  skewMs,
  timeLeftMs,
  warmupSyncReducer,
} from "@/lib/warmup/syncedRun";
import { warmupById } from "@/lib/warmup/exercises";
import { timelineTotalMs } from "@/lib/warmup/timeline";

const T0 = Date.UTC(2026, 9, 28, 10, 0, 0);

describe("parseDbTimestamp", () => {
  it("reads ISO with offset, Postgres without zone (as UTC), Date, and rejects junk", () => {
    expect(parseDbTimestamp("2026-10-28T10:00:00.000Z")).toBe(T0);
    expect(parseDbTimestamp("2026-10-28T12:00:00+02:00")).toBe(T0);
    expect(parseDbTimestamp("2026-10-28 10:00:00")).toBe(T0);
    expect(parseDbTimestamp(new Date(T0))).toBe(T0);
    expect(parseDbTimestamp(null)).toBeNull();
    expect(parseDbTimestamp("nope")).toBeNull();
    expect(parseDbTimestamp("")).toBeNull();
  });
});

describe("seek / missed / running", () => {
  const run = 60_000;
  it("skew = server − client", () => {
    expect(skewMs(1000, 400)).toBe(600);
  });
  it("live pickup clamps to [0, 2000]; poll trusts the clocks", () => {
    expect(seekFor(T0, T0 + 700, 0, { live: true })).toBe(700);
    expect(seekFor(T0, T0 + 9000, 0, { live: true })).toBe(2000);
    expect(seekFor(T0, T0 - 500, 0, { live: true })).toBe(0);
    expect(seekFor(T0, T0 + 9000, 0, { live: false })).toBe(9000);
    expect(seekFor(T0, T0 + 9000, -4000, { live: false })).toBe(5000); // client clock ahead
    expect(seekFor(T0, T0 - 9000, 0, { live: false })).toBe(0);
  });
  it("missed when fewer than 20 s remain", () => {
    expect(isMissed(T0, T0 + 30_000, 0, run)).toBe(false);
    expect(isMissed(T0, T0 + 41_000, 0, run)).toBe(true);
    expect(isMissed(T0, T0 + 99_000, 0, run)).toBe(true);
  });
  it("isRunning / timeLeft / format", () => {
    expect(isRunning(null, T0, 0, run)).toBe(false);
    expect(isRunning(T0, T0 + 1000, 0, run)).toBe(true);
    expect(isRunning(T0, T0 + 60_000, 0, run)).toBe(false);
    expect(timeLeftMs(T0, T0 + 12_000, 0, run)).toBe(48_000);
    expect(formatTimeLeft(192_000)).toBe("3:12");
    expect(formatTimeLeft(5_400)).toBe("0:06");
    expect(formatTimeLeft(0)).toBe("0:00");
  });
  it("runLengthMs equals the session-mode timeline total", () => {
    const ex = warmupById("eyes")!;
    expect(runLengthMs("eyes")).toBe(timelineTotalMs(ex, "session"));
    expect(runLengthMs("eyes")).toBeGreaterThan(runLengthMs("arm-raise"));
    expect(runLengthMs(null)).toBe(0);
    expect(runLengthMs("nope")).toBe(0);
  });
});

describe("warmupSyncReducer (full-row UPDATE payloads)", () => {
  const iso = new Date(T0).toISOString();
  it("opens once on a new value and ignores the same value again", () => {
    let s = { lastStartedAt: null as number | null };
    let r = warmupSyncReducer(s, { warmupStartedAt: iso, referenceSampleId: "x" });
    expect(r.action).toEqual({ type: "open", startedAtMs: T0 });
    s = r.state;
    r = warmupSyncReducer(s, { warmupStartedAt: iso, referenceSampleId: "y" }); // reference change
    expect(r.action).toEqual({ type: "none" });
    expect(r.state).toBe(s);
  });
  it("a newer value after a skip opens again; null after a value stops; null when never set is nothing", () => {
    let r = warmupSyncReducer({ lastStartedAt: T0 }, { warmup_started_at: new Date(T0 + 60_000).toISOString() });
    expect(r.action).toEqual({ type: "open", startedAtMs: T0 + 60_000 });
    r = warmupSyncReducer(r.state, { warmupStartedAt: null });
    expect(r.action).toEqual({ type: "stopped" });
    expect(r.state.lastStartedAt).toBeNull();
    r = warmupSyncReducer({ lastStartedAt: null }, { warmupStartedAt: null });
    expect(r.action).toEqual({ type: "none" });
    r = warmupSyncReducer({ lastStartedAt: null }, { startedAt: iso });
    expect(r.action).toEqual({ type: "none" });
  });
});
