import { describe, expect, it } from "vitest";
import {
  TIMER_BREAK_MS,
  TIMER_PASS1_MS,
  TIMER_STALE_MS,
  canAdvancePass,
  clearTimerKeys,
  formatTimer,
  parseTimerStart,
  timerCue,
  timerStorageKey,
} from "@/lib/cuppingTimer";

// S10 WP3b (A5): the optional cupping timer. Client-only and pure. TODO(kim-validar:A5)
describe("timerCue: which cue at t", () => {
  it("rests until 4:00, breaks the crust at 4:00, first pass at 8:00", () => {
    expect(timerCue(0, 0)).toBe("wait");
    expect(timerCue(TIMER_BREAK_MS - 1, 0)).toBe("wait");
    expect(timerCue(TIMER_BREAK_MS, 0)).toBe("break");
    expect(timerCue(TIMER_PASS1_MS - 1, 0)).toBe("break");
    expect(timerCue(TIMER_PASS1_MS, 0)).toBe("pass1");
  });

  it("the later passes are advanced by hand, never by the clock", () => {
    expect(timerCue(60 * 60_000, 0)).toBe("pass1");
    expect(timerCue(TIMER_PASS1_MS, 1)).toBe("pass2");
    expect(timerCue(TIMER_PASS1_MS, 2)).toBe("pass3");
    expect(timerCue(TIMER_PASS1_MS, 9)).toBe("pass3");
    expect(timerCue(TIMER_PASS1_MS, -3)).toBe("pass1");
  });

  it("manual advances do nothing before the first pass has begun", () => {
    expect(timerCue(TIMER_BREAK_MS, 2)).toBe("break");
    expect(canAdvancePass(TIMER_PASS1_MS - 1, 0)).toBe(false);
    expect(canAdvancePass(TIMER_PASS1_MS, 0)).toBe(true);
    expect(canAdvancePass(TIMER_PASS1_MS, 1)).toBe(true);
    expect(canAdvancePass(TIMER_PASS1_MS, 2)).toBe(false);
  });

  it("garbage in, 'wait' out", () => {
    expect(timerCue(NaN, 0)).toBe("wait");
    expect(timerCue(-5, 0)).toBe("wait");
  });
});

describe("formatTimer", () => {
  it("mm:ss, never negative", () => {
    expect(formatTimer(0)).toBe("00:00");
    expect(formatTimer(999)).toBe("00:00");
    expect(formatTimer(61_000)).toBe("01:01");
    expect(formatTimer(TIMER_PASS1_MS)).toBe("08:00");
    expect(formatTimer(75 * 60_000 + 5_000)).toBe("75:05");
    expect(formatTimer(-1000)).toBe("00:00");
    expect(formatTimer(NaN)).toBe("00:00");
  });
});

describe("the stored start (the only thing kept)", () => {
  const now = 1_700_000_000_000;

  it("is keyed per session and user", () => {
    expect(timerStorageKey("s1", "u1")).toBe("cata_timer_s1_u1");
  });

  it("accepts a sane timestamp and rejects garbage, the future and a forgotten timer", () => {
    expect(parseTimerStart(String(now - 5000), now)).toBe(now - 5000);
    expect(parseTimerStart(null, now)).toBeNull();
    expect(parseTimerStart("", now)).toBeNull();
    expect(parseTimerStart("abc", now)).toBeNull();
    expect(parseTimerStart("-5", now)).toBeNull();
    expect(parseTimerStart(String(now + 60_000), now)).toBeNull();
    expect(parseTimerStart(String(now - TIMER_STALE_MS - 1), now)).toBeNull();
  });

  it("clearTimerKeys removes only timer keys (sign-out)", () => {
    const store = new Map<string, string>([
      ["cata_timer_a_b", "1"],
      ["cata_timer_c_d", "2"],
      ["cata_results_view", "tabla"],
    ]);
    const storage = {
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      removeItem: (k: string) => void store.delete(k),
    };
    clearTimerKeys(storage);
    expect([...store.keys()]).toEqual(["cata_results_view"]);
  });
});
