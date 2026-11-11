import { describe, expect, it } from "vitest";
import {
  decideAll,
  decideThrottle,
  groupRecipientRule,
  GROUP_BROADCASTS_PER_HOUR,
  GROUP_RECIPIENTS_PER_DAY,
  GROUP_RECIPIENTS_PER_DAY_NEW_ACCOUNT,
  CLOSE_RESEND_PER_SESSION,
  MAGIC_LINK_PER_ADDRESS,
  MAGIC_LINK_PER_IP,
  MAGIC_LINK_PER_USER,
  ledgerPurgeCutoff,
  MAX_WINDOW_MS,
  NEW_ACCOUNT_AGE_MS,
  type ThrottleRule,
} from "@/lib/emailLimits";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = 10_000_000_000;
const one = { recipients: 1 };

const ev = (agoMs: number, recipients = 1) => ({ at: NOW - agoMs, recipients });

describe("decideThrottle: maxEvents", () => {
  const rule: ThrottleRule = { windowMs: 15 * MIN, maxEvents: 3 };

  it("allows when empty and ignores events older than the window", () => {
    expect(decideThrottle([], rule, one, NOW)).toEqual({ allowed: true });
    const old = [ev(16 * MIN), ev(20 * MIN), ev(HOUR)];
    expect(decideThrottle(old, rule, one, NOW)).toEqual({ allowed: true });
  });

  it("allows the Nth and refuses the N+1th", () => {
    expect(decideThrottle([ev(2 * MIN), ev(MIN)], rule, one, NOW)).toEqual({ allowed: true });
    const d = decideThrottle([ev(3 * MIN), ev(2 * MIN), ev(MIN)], rule, one, NOW);
    expect(d.allowed).toBe(false);
  });

  it("retryAfterMs is the time until the oldest in-window event leaves", () => {
    const d = decideThrottle([ev(10 * MIN), ev(5 * MIN), ev(MIN)], rule, one, NOW);
    expect(d).toEqual({ allowed: false, retryAfterMs: 5 * MIN });
  });

  it("with more events than the cap, waits for the right one (5 events, cap 3 -> 3rd oldest)", () => {
    const events = [ev(14 * MIN), ev(12 * MIN), ev(9 * MIN), ev(5 * MIN), ev(MIN)];
    const d = decideThrottle(events, rule, one, NOW);
    // 3rd oldest is 9 min ago -> leaves the window in 6 min.
    expect(d).toEqual({ allowed: false, retryAfterMs: 6 * MIN });
  });

  it("does not depend on input order", () => {
    const events = [ev(MIN), ev(14 * MIN), ev(5 * MIN), ev(9 * MIN), ev(12 * MIN)];
    expect(decideThrottle(events, rule, one, NOW)).toEqual({ allowed: false, retryAfterMs: 6 * MIN });
  });

  it("an event exactly at now - windowMs is outside the window", () => {
    const events = [ev(15 * MIN), ev(2 * MIN), ev(MIN)];
    expect(decideThrottle(events, rule, one, NOW)).toEqual({ allowed: true });
  });

  it("an event one ms inside the window still counts and retryAfterMs is 1", () => {
    const events = [ev(15 * MIN - 1), ev(2 * MIN), ev(MIN)];
    expect(decideThrottle(events, rule, one, NOW)).toEqual({ allowed: false, retryAfterMs: 1 });
  });
});

describe("decideThrottle: maxRecipients", () => {
  const rule: ThrottleRule = { windowMs: DAY, maxRecipients: 10 };

  it("allows exactly up to the cap and refuses cap+1 (no partial sends)", () => {
    expect(decideThrottle([ev(HOUR, 4)], rule, { recipients: 6 }, NOW)).toEqual({ allowed: true });
    const d = decideThrottle([ev(HOUR, 4)], rule, { recipients: 7 }, NOW);
    expect(d.allowed).toBe(false);
  });

  it("ignores recipients of events outside the window", () => {
    expect(decideThrottle([ev(DAY + 1, 10)], rule, { recipients: 10 }, NOW)).toEqual({
      allowed: true,
    });
  });

  it("retryAfterMs is when enough recipients age out (single event)", () => {
    const d = decideThrottle([ev(2 * HOUR, 8)], rule, { recipients: 5 }, NOW);
    expect(d).toEqual({ allowed: false, retryAfterMs: DAY - 2 * HOUR });
  });

  it("walks several events when one ageing out is not enough", () => {
    // used = 3 + 3 + 3 = 9; need 8 -> must drop below 2 used -> all three age out.
    const events = [ev(20 * HOUR, 3), ev(10 * HOUR, 3), ev(HOUR, 3)];
    const d = decideThrottle(events, rule, { recipients: 8 }, NOW);
    expect(d).toEqual({ allowed: false, retryAfterMs: DAY - HOUR });
    // need 5 -> used must be <= 5 -> the two oldest age out (9-3-3 = 3).
    const d2 = decideThrottle(events, rule, { recipients: 5 }, NOW);
    expect(d2).toEqual({ allowed: false, retryAfterMs: DAY - 10 * HOUR });
    // need 2 -> used must be <= 8 -> only the oldest ages out.
    const d3 = decideThrottle(events, rule, { recipients: 2 }, NOW);
    expect(d3).toEqual({ allowed: false, retryAfterMs: DAY - 20 * HOUR });
  });

  it("a request larger than the cap returns the full window", () => {
    expect(decideThrottle([], rule, { recipients: 11 }, NOW)).toEqual({
      allowed: false,
      retryAfterMs: DAY,
    });
    expect(decideThrottle([ev(HOUR, 2)], rule, { recipients: 11 }, NOW)).toEqual({
      allowed: false,
      retryAfterMs: DAY,
    });
  });

  it("retryAfterMs is always > 0 when refused", () => {
    const cases: Array<[ReturnType<typeof ev>[], ThrottleRule, number]> = [
      [[ev(15 * MIN - 1), ev(MIN), ev(2 * MIN)], { windowMs: 15 * MIN, maxEvents: 3 }, 1],
      [[ev(DAY - 1, 10)], rule, 1],
      [[], rule, 99],
    ];
    for (const [events, r, recipients] of cases) {
      const d = decideThrottle(events, r, { recipients }, NOW);
      expect(d.allowed).toBe(false);
      if (!d.allowed) expect(d.retryAfterMs).toBeGreaterThan(0);
    }
  });
});

describe("decideThrottle: both bounds", () => {
  it("takes the longer of the two waits", () => {
    const rule: ThrottleRule = { windowMs: HOUR, maxEvents: 2, maxRecipients: 100 };
    // events bound: 2 events at cap 2 -> oldest (50 min ago) leaves in 10 min.
    // recipients bound: 100 used, asking 60 -> both must age out -> newest (30 min ago) leaves
    // in 30 min. Longest = 30.
    const events = [ev(30 * MIN, 50), ev(50 * MIN, 50)];
    expect(decideThrottle(events, rule, { recipients: 60 }, NOW)).toEqual({
      allowed: false,
      retryAfterMs: 30 * MIN,
    });
    // asking 10 -> recipients bound needs only the oldest out (10 min), same as events bound.
    expect(decideThrottle(events, rule, { recipients: 10 }, NOW)).toEqual({
      allowed: false,
      retryAfterMs: 10 * MIN,
    });
  });
});

describe("decideAll", () => {
  it("allows when every rule allows", () => {
    expect(
      decideAll(
        [
          { events: [], rule: MAGIC_LINK_PER_ADDRESS },
          { events: [], rule: MAGIC_LINK_PER_IP },
        ],
        one,
        NOW,
      ),
    ).toEqual({ allowed: true });
  });

  it("returns the longest wait among refusing rules", () => {
    const short = { windowMs: 10 * MIN, maxEvents: 1 };
    const long = { windowMs: HOUR, maxEvents: 1 };
    const d = decideAll(
      [
        { events: [ev(5 * MIN)], rule: short }, // 5 min
        { events: [ev(5 * MIN)], rule: long }, // 55 min
        { events: [], rule: short },
      ],
      one,
      NOW,
    );
    expect(d).toEqual({ allowed: false, retryAfterMs: 55 * MIN });
  });
});

describe("groupRecipientRule", () => {
  it("uses the new-account rule under 24 h", () => {
    expect(groupRecipientRule(NOW - NEW_ACCOUNT_AGE_MS + 1, NOW)).toBe(
      GROUP_RECIPIENTS_PER_DAY_NEW_ACCOUNT,
    );
    expect(groupRecipientRule(NOW, NOW)).toBe(GROUP_RECIPIENTS_PER_DAY_NEW_ACCOUNT);
  });

  it("uses the normal rule at or after 24 h, or for a null creation time", () => {
    expect(groupRecipientRule(NOW - NEW_ACCOUNT_AGE_MS, NOW)).toBe(GROUP_RECIPIENTS_PER_DAY);
    expect(groupRecipientRule(NOW - 5 * DAY, NOW)).toBe(GROUP_RECIPIENTS_PER_DAY);
    expect(groupRecipientRule(null, NOW)).toBe(GROUP_RECIPIENTS_PER_DAY);
  });
});

describe("limit constants", () => {
  it("keep their current values", () => {
    expect(MAGIC_LINK_PER_ADDRESS).toEqual({ windowMs: 15 * MIN, maxEvents: 3 });
    expect(MAGIC_LINK_PER_IP).toEqual({ windowMs: 15 * MIN, maxEvents: 60 });
    expect(GROUP_BROADCASTS_PER_HOUR).toEqual({ windowMs: HOUR, maxEvents: 3 });
    expect(GROUP_RECIPIENTS_PER_DAY).toEqual({ windowMs: DAY, maxRecipients: 300 });
    expect(GROUP_RECIPIENTS_PER_DAY_NEW_ACCOUNT).toEqual({ windowMs: DAY, maxRecipients: 40 });
    expect(NEW_ACCOUNT_AGE_MS).toBe(DAY);
    expect(CLOSE_RESEND_PER_SESSION).toEqual({ windowMs: HOUR, maxEvents: 3 });
    expect(MAX_WINDOW_MS).toBe(DAY);
  });
});

describe("S8-28 A-03/A-04", () => {
  it("ledgerPurgeCutoff is older than every rule window, so a purge never changes a decision", () => {
    const cutoff = ledgerPurgeCutoff(NOW);
    expect(cutoff).toBeLessThan(NOW - MAX_WINDOW_MS);
    expect(NOW - cutoff).toBeLessThanOrEqual(MAX_WINDOW_MS + 2 * HOUR);
  });

  it("MAGIC_LINK_PER_USER refuses the 11th link in 15 minutes from one account", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ev((i + 1) * 10_000));
    expect(decideThrottle(ten.slice(0, 9), MAGIC_LINK_PER_USER, one, NOW)).toEqual({ allowed: true });
    expect(decideThrottle(ten, MAGIC_LINK_PER_USER, one, NOW).allowed).toBe(false);
    expect(decideThrottle([ev(16 * MIN), ...ten.slice(0, 5)], MAGIC_LINK_PER_USER, one, NOW)).toEqual({ allowed: true });
  });
});

describe("S9-01 A-09: close-email resend", () => {
  it("allows 3 resends per session per hour, the 4th waits for the oldest to age out", () => {
    const events = [ev(50 * MIN), ev(20 * MIN), ev(5 * MIN)];
    const d = decideThrottle(events, CLOSE_RESEND_PER_SESSION, { recipients: 0 }, NOW);
    expect(d).toEqual({ allowed: false, retryAfterMs: 10 * MIN });
    expect(decideThrottle(events.slice(1), CLOSE_RESEND_PER_SESSION, { recipients: 0 }, NOW)).toEqual({
      allowed: true,
    });
  });
});
