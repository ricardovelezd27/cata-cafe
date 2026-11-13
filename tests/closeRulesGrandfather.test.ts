// S10 WP4a, third round: the owner's grandfather rule for the idle auto-close, and the pin on the
// wiring of the repair pass. TODO(kim-validar:C3)
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  IDLE_RULE_EFFECTIVE_AT,
  IDLE_SILENT_CLOSE_MS,
  LIVE_AUTO_CLOSE_MS,
  closedSilently,
  emailModeForIdleDecision,
  idleCandidateBands,
  idleCloseDecision,
  isGrandfatheredIdle,
  isLiveAbandoned,
  repairEmailMode,
  shouldSendLiveIdleReminder,
} from "@/lib/closeRules";

const DAY = 24 * 3_600_000;
const EFF = IDLE_RULE_EFFECTIVE_AT;
const BEFORE = new Date(EFF.getTime() - 1); // one millisecond before the rule
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

describe("IDLE_RULE_EFFECTIVE_AT", () => {
  it("is 2026-11-18 00:00 UTC", () => {
    expect(EFF.toISOString()).toBe("2026-11-18T00:00:00.000Z");
  });
  it("is the same instant as the one literal at the top of the PHASE 28 dry run", () => {
    const dry = read("prisma/sql/dry-runs/phase28_dry_run.sql");
    const lits = [...dry.matchAll(/v_effective timestamp := '([^']+)';/g)];
    expect(lits).toHaveLength(1);
    expect(new Date(`${lits[0][1].replace(" ", "T")}Z`).getTime()).toBe(EFF.getTime());
    // and the dry run names the TypeScript constant next to it
    expect(dry).toContain("IDLE_RULE_EFFECTIVE_AT");
  });
});

describe("isGrandfatheredIdle", () => {
  it("started before the effective instant: grandfathered; exactly at it or after: not", () => {
    expect(isGrandfatheredIdle(BEFORE)).toBe(true);
    expect(isGrandfatheredIdle(new Date(EFF.getTime() - 100 * DAY))).toBe(true);
    expect(isGrandfatheredIdle(EFF)).toBe(false);
    expect(isGrandfatheredIdle(new Date(EFF.getTime() + 1))).toBe(false);
  });
  it("a session that never started is not grandfathered", () => {
    expect(isGrandfatheredIdle(null)).toBe(false);
  });
});

describe("idleCloseDecision: started before / after the rule x idle band", () => {
  const started = (after: boolean) => (after ? EFF : BEFORE);
  const table: [boolean, number, "none" | "emails" | "silent"][] = [
    // started ON/AFTER the rule: designed rule
    [true, 0, "none"],
    [true, LIVE_AUTO_CLOSE_MS - 1, "none"],
    [true, LIVE_AUTO_CLOSE_MS, "emails"], // exactly 7 d
    [true, 20 * DAY, "emails"],
    [true, IDLE_SILENT_CLOSE_MS - 1, "emails"],
    [true, IDLE_SILENT_CLOSE_MS, "silent"], // exactly 30 d
    [true, 400 * DAY, "silent"],
    // started BEFORE the rule: grandfathered, never emails
    [false, 0, "none"],
    [false, LIVE_AUTO_CLOSE_MS, "none"], // 7 d: left alone
    [false, 20 * DAY, "none"],
    [false, IDLE_SILENT_CLOSE_MS - 1, "none"],
    [false, IDLE_SILENT_CLOSE_MS, "silent"], // exactly 30 d
    [false, 400 * DAY, "silent"],
  ];
  for (const [after, idleMs, want] of table) {
    it(`started ${after ? "on/after" : "before"} the rule, idle ${idleMs / DAY} d: ${want}`, () => {
      expect(idleCloseDecision({ startedAt: started(after), idleMs })).toBe(want);
    });
  }
  it("a session started exactly at the effective instant is NOT grandfathered (7 d = emails)", () => {
    expect(idleCloseDecision({ startedAt: EFF, idleMs: 7 * DAY })).toBe("emails");
    expect(idleCloseDecision({ startedAt: BEFORE, idleMs: 7 * DAY })).toBe("none");
  });
  it("never started: none, whatever the idle", () => {
    expect(idleCloseDecision({ startedAt: null, idleMs: 400 * DAY })).toBe("none");
  });
  it("only a decision that closes has an email mode: emails -> await, silent -> skip", () => {
    expect(emailModeForIdleDecision("emails")).toBe("await");
    expect(emailModeForIdleDecision("silent")).toBe("skip");
  });
});

describe("every consumer agrees with idleCloseDecision", () => {
  const now = EFF.getTime() + 200 * DAY;
  const live = (startedAt: Date) => ({ isGroup: true, isAsync: false, closesAt: null, status: "active", startedAt });
  const idleSince = (d: number) => new Date(now - d);

  it("isLiveAbandoned is exactly decision !== none, grandfathered or not", () => {
    for (const grand of [true, false]) {
      for (const idle of [0, 6 * DAY, 7 * DAY, 29 * DAY, 30 * DAY, 90 * DAY]) {
        // start at the effective bounds so the idle is carried by the last evaluation
        const startedAt = grand ? BEFORE : EFF;
        const row = live(startedAt);
        const expected = idleCloseDecision({ startedAt, idleMs: idle }) !== "none";
        expect(isLiveAbandoned(row, idleSince(idle), now), `${grand} ${idle / DAY}`).toBe(expected);
      }
    }
  });

  it("the reminder: a grandfathered session never gets one; a new one between 24 h and 7 d does", () => {
    const grand = live(BEFORE);
    for (const idle of [DAY, 3 * DAY, 6 * DAY, 8 * DAY, 40 * DAY]) {
      expect(shouldSendLiveIdleReminder(grand, idleSince(idle), now), `grandfathered ${idle / DAY}`).toBe(false);
    }
    const fresh = live(EFF);
    expect(shouldSendLiveIdleReminder(fresh, idleSince(DAY), now)).toBe(true);
    expect(shouldSendLiveIdleReminder(fresh, idleSince(7 * DAY), now)).toBe(false);
  });

  it("the repair rule: a grandfathered silent close stays silent; a new idle-10-days close is repaired with emails", () => {
    const facts = { isLiveGroup: true, closeEmailLedgerRows: 0 };
    expect(repairEmailMode({ ...facts, startedAt: BEFORE, idleAtCloseMs: 31 * DAY })).toBe("skip");
    expect(closedSilently({ ...facts, startedAt: BEFORE, idleAtCloseMs: 31 * DAY })).toBe(true);
    expect(repairEmailMode({ ...facts, startedAt: EFF, idleAtCloseMs: 10 * DAY })).toBe("await");
    // a grandfathered session an owner closed by hand at 10 idle days keeps today's behaviour: emails
    expect(repairEmailMode({ ...facts, startedAt: BEFORE, idleAtCloseMs: 10 * DAY })).toBe("await");
    expect(closedSilently({ ...facts, startedAt: BEFORE, idleAtCloseMs: 10 * DAY })).toBe(false);
  });
});

describe("idleCandidateBands mirrors the rule (the query never fetches a grandfathered session idle < 30 d)", () => {
  const now = EFF.getTime() + 100 * DAY;
  const bands = idleCandidateBands(now);
  /** Would the query fetch a session that started at `s` and whose last evaluation was at `lastEval`? */
  const fetched = (s: Date, lastEval: Date | null) =>
    bands.some(
      (b) =>
        s.getTime() <= b.startedAtMost.getTime() &&
        (!b.startedFrom || s.getTime() >= b.startedFrom.getTime()) &&
        (!b.startedBefore || s.getTime() < b.startedBefore.getTime()) &&
        !(lastEval && lastEval.getTime() > b.activityAfter.getTime()),
    );
  it("has the same answer as the rule on both sides of every boundary", () => {
    const startOptions = [new Date(EFF.getTime() - 50 * DAY), BEFORE, EFF, new Date(EFF.getTime() + 60 * DAY)];
    const idles = [0, 7 * DAY - 1, 7 * DAY, 30 * DAY - 1, 30 * DAY, 60 * DAY];
    for (const s of startOptions) {
      for (const idle of idles) {
        // idle carried by the last evaluation when it is later than the start, else by the start
        const last = new Date(now - idle);
        const lastEval = last.getTime() > s.getTime() ? last : null;
        const effectiveIdle = lastEval ? idle : now - s.getTime();
        const want = idleCloseDecision({ startedAt: s, idleMs: effectiveIdle }) !== "none";
        expect(fetched(s, lastEval), `${s.toISOString()} idle ${idle / DAY}`).toBe(want);
      }
    }
  });
});

// L1: the repair pass is wired to the one place that decides its email mode.
describe("the repair wiring (review L1)", () => {
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(join(root, dir))) {
      if (name === "node_modules" || name === "generated" || name.startsWith(".")) continue;
      const rel = `${dir}/${name}`;
      if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
    }
    return out;
  }
  it("the cron route's repair loop calls repairClosedSession( and never closeSessionInternal with reason repair", () => {
    const route = stripComments(read("app/api/cron/close-expired-sessions/route.ts"));
    const loop = route.slice(route.indexOf("for (const s of owed)"));
    expect(loop).toMatch(/await repairClosedSession\(s\.id\)/);
    expect(route).not.toMatch(/reason:\s*["']repair["']/);
  });
  // The one other caller is the results page's on-view repair of a SOLO owner's session (S8-21): it never
  // sends email, so it always passes emails "skip" and has no email decision to take.
  const SOLO_ON_VIEW = "app/[locale]/app/sessions/[id]/results/page.tsx";
  it("no file other than lib/repairClose.ts and the solo on-view repair calls closeSessionInternal with reason repair", () => {
    const offenders = [...walk("app"), ...walk("lib"), ...walk("components")].filter(
      (f) => f !== "lib/repairClose.ts" && f !== SOLO_ON_VIEW && /reason:\s*["']repair["']/.test(stripComments(read(f))),
    );
    expect(offenders).toEqual([]);
  });
  it("the solo on-view repair always skips email", () => {
    const calls = [...stripComments(read(SOLO_ON_VIEW)).matchAll(/closeSessionInternal\([^)]*reason:\s*["']repair["'][^)]*\)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c[0]).toMatch(/emails:\s*"skip"/);
  });
  it("lib/repairClose.ts itself decides the mode with repairEmailMode", () => {
    const src = stripComments(read("lib/repairClose.ts"));
    expect(src).toMatch(/emails\s*=\s*facts\s*\?\s*repairEmailMode\(facts\)/);
    expect(src).toMatch(/closeSessionInternal\(sessionId,\s*\{\s*reason:\s*"repair",\s*emails\s*\}\)/);
  });
});
