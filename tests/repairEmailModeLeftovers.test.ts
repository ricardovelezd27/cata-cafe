import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IDLE_RULE_EFFECTIVE_AT, IDLE_SILENT_CLOSE_MS, LIVE_AUTO_CLOSE_MS, repairEmailMode } from "@/lib/closeRules";

const DAY = 86_400_000;
const BEFORE = new Date(IDLE_RULE_EFFECTIVE_AT.getTime() - 1);
const ON = new Date(IDLE_RULE_EFFECTIVE_AT.getTime());

describe("repairEmailMode: a deleted-account creator (S10 leftovers B1)", () => {
  // KNOWN CONSEQUENCE, documented not changed: a session closed by its DEADLINE
  // whose first finalize failed, whose organiser then deleted the account before
  // the repair, is repaired WITHOUT emails: the participants never get the close
  // email (they still see the results in the app). docs/flows.md section 1,
  // runbook section 33.
  const deadlineClosed = { isLiveGroup: false, startedAt: null, idleAtCloseMs: null, closeEmailLedgerRows: 0 };

  it("a deadline-closed group session is repaired with emails while its organiser exists", () => {
    expect(repairEmailMode({ ...deadlineClosed, ownerDeleted: false })).toBe("await");
    expect(repairEmailMode(deadlineClosed)).toBe("await");
  });

  it("the same session whose organiser deleted the account is repaired silently: no close email, ever", () => {
    expect(repairEmailMode({ ...deadlineClosed, ownerDeleted: true })).toBe("skip");
  });
});

describe("repairEmailMode: the grandfather input (S10 leftovers B2)", () => {
  const live = { isLiveGroup: true, closeEmailLedgerRows: 0 };

  it("a session started BEFORE the idle rule and closed for idleness at 30+ days is repaired silently", () => {
    for (const d of [30, 31, 90]) {
      expect(repairEmailMode({ ...live, startedAt: BEFORE, idleAtCloseMs: d * DAY }), `${d} d`).toBe("skip");
    }
  });

  it("a session started ON/AFTER the rule follows the idle decision: silent from 30 d, emails from 7 d up to 30 d", () => {
    expect(repairEmailMode({ ...live, startedAt: ON, idleAtCloseMs: IDLE_SILENT_CLOSE_MS })).toBe("skip");
    expect(repairEmailMode({ ...live, startedAt: ON, idleAtCloseMs: IDLE_SILENT_CLOSE_MS - 1 })).toBe("await");
    expect(repairEmailMode({ ...live, startedAt: ON, idleAtCloseMs: LIVE_AUTO_CLOSE_MS })).toBe("await");
  });

  it("the grandfather cut-off never changes the repair: both sides of it answer the same at every idle value (they only differ in WHEN the idle pass closes)", () => {
    for (const idle of [0, DAY, 6 * DAY, 7 * DAY, 10 * DAY, 29 * DAY, IDLE_SILENT_CLOSE_MS - 1, IDLE_SILENT_CLOSE_MS, 60 * DAY]) {
      const a = repairEmailMode({ ...live, startedAt: BEFORE, idleAtCloseMs: idle });
      const b = repairEmailMode({ ...live, startedAt: ON, idleAtCloseMs: idle });
      expect(a, `${idle / DAY} d`).toBe(b);
      expect(a, `${idle / DAY} d`).toBe(idle >= IDLE_SILENT_CLOSE_MS ? "skip" : "await");
    }
  });

  it("a session that never started (no startedAt) is never silent", () => {
    expect(repairEmailMode({ ...live, startedAt: null, idleAtCloseMs: null })).toBe("await");
  });

  it("lib/repairClose.ts hands startedAt (the grandfather input) from the session row to the rule", () => {
    const src = readFileSync("lib/repairClose.ts", "utf8");
    expect(src).toMatch(/startedAt:\s*s\.startedAt/);
    expect(src).toMatch(/select:\s*\{[^}]*startedAt:\s*true/);
  });
});
