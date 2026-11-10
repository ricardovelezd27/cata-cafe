import { describe, expect, it } from "vitest";
import {
  MAX_SEND_ATTEMPTS,
  backoffMs,
  idempotencyKeyFor,
  isBroadcastId,
  isRetryable,
  planBroadcast,
  sendWithRetry,
  summarize,
} from "@/lib/groupEmailPlan";

const r = (memberId: string) => ({ memberId, label: `m-${memberId}` });

describe("planBroadcast", () => {
  it("sends everyone on a first attempt", () => {
    const plan = planBroadcast([r("a"), r("b")], []);
    expect(plan.toSend.map((x) => x.memberId)).toEqual(["a", "b"]);
    expect(plan.alreadySent).toEqual([]);
    expect(plan.isRetry).toBe(false);
  });
  it("a retry resends only rows that are not sent", () => {
    const plan = planBroadcast(
      [r("a"), r("b"), r("c")],
      [
        { memberId: "a", status: "sent" },
        { memberId: "b", status: "failed" },
        { memberId: "c", status: "skipped" },
      ],
    );
    expect(plan.toSend.map((x) => x.memberId)).toEqual(["b", "c"]);
    expect(plan.alreadySent.map((x) => x.memberId)).toEqual(["a"]);
    expect(plan.isRetry).toBe(true);
  });
  it("isRetry when every recipient still to send is already in the ledger", () => {
    const plan = planBroadcast(
      [r("a"), r("b")],
      [
        { memberId: "a", status: "failed" },
        { memberId: "b", status: "failed" },
      ],
    );
    expect(plan.isRetry).toBe(true);
  });
  it("not a retry when one recipient to send is new to the ledger", () => {
    const plan = planBroadcast([r("a"), r("b")], [{ memberId: "a", status: "sent" }]);
    expect(plan.toSend.map((x) => x.memberId)).toEqual(["b"]);
    expect(plan.isRetry).toBe(false);
  });
  it("not a retry when everything is already sent", () => {
    const plan = planBroadcast([r("a"), r("b")], [
      { memberId: "a", status: "sent" },
      { memberId: "b", status: "sent" },
    ]);
    expect(plan.toSend).toEqual([]);
    expect(plan.isRetry).toBe(false);
  });
  it("not a retry with an empty ledger", () => {
    expect(planBroadcast([r("a")], []).isRetry).toBe(false);
  });
  it("never lists a recipient twice per broadcast", () => {
    const plan = planBroadcast([r("a"), r("a"), r("b")], []);
    expect(plan.toSend.map((x) => x.memberId)).toEqual(["a", "b"]);
  });
  it("nothing to send once everyone is sent", () => {
    const plan = planBroadcast([r("a")], [{ memberId: "a", status: "sent" }]);
    expect(plan.toSend).toEqual([]);
  });
});

describe("summarize", () => {
  it("counts by status and carries no address field", () => {
    const s = summarize([
      { ...r("a"), status: "sent" as const },
      { ...r("b"), status: "failed" as const },
      { ...r("c"), status: "skipped" as const },
    ]);
    expect(s).toMatchObject({ attempted: 3, sent: 1, skipped: 1, failed: 1 });
    expect(JSON.stringify(s)).not.toContain("@");
  });
});

describe("backoff and retry policy", () => {
  it("retries rate limits, provider errors and network failures only", () => {
    expect(isRetryable("resend_429")).toBe(true);
    expect(isRetryable("resend_5xx")).toBe(true);
    expect(isRetryable("network")).toBe(true);
    expect(isRetryable("resend_4xx")).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
  it("grows exponentially, honours Retry-After, and is capped", () => {
    const noJitter = () => 0;
    expect(backoffMs(1, undefined, noJitter)).toBe(400);
    expect(backoffMs(2, undefined, noJitter)).toBe(800);
    expect(backoffMs(3, undefined, noJitter)).toBe(1600);
    expect(backoffMs(1, 2000, noJitter)).toBe(2000);
    expect(backoffMs(1, 60_000, noJitter)).toBe(5000);
    expect(backoffMs(2, undefined, () => 1)).toBe(1200);
  });
  it("retries a 429 and succeeds, sleeping between attempts", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const out = await sendWithRetry(
      async () => (++calls < 3 ? { ok: false, code: "resend_429" as const } : { ok: true }),
      async (ms) => {
        sleeps.push(ms);
      },
      () => 0,
    );
    expect(out).toEqual({ status: "sent", attempts: 3 });
    expect(sleeps).toHaveLength(2);
  });
  it("gives up after the maximum attempts", async () => {
    let calls = 0;
    const out = await sendWithRetry(
      async () => {
        calls += 1;
        return { ok: false, code: "resend_5xx" as const };
      },
      async () => {},
    );
    expect(calls).toBe(MAX_SEND_ATTEMPTS);
    expect(out).toEqual({ status: "failed", attempts: MAX_SEND_ATTEMPTS, code: "resend_5xx" });
  });
  it("does not retry a 4xx and reports a skipped send as skipped", async () => {
    let calls = 0;
    const failed = await sendWithRetry(
      async () => {
        calls += 1;
        return { ok: false, code: "resend_4xx" as const };
      },
      async () => {},
    );
    expect(calls).toBe(1);
    expect(failed.status).toBe("failed");
    const skipped = await sendWithRetry(async () => ({ ok: false, skipped: true }), async () => {});
    expect(skipped).toEqual({ status: "skipped", attempts: 1 });
  });
  it("a thrown send counts as a network failure", async () => {
    const out = await sendWithRetry(
      async () => {
        throw new Error("boom");
      },
      async () => {},
    );
    expect(out).toMatchObject({ status: "failed", attempts: MAX_SEND_ATTEMPTS, code: "network" });
  });
});

describe("ids and keys", () => {
  it("accepts only uuids as broadcast ids", () => {
    expect(isBroadcastId("3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b")).toBe(true);
    for (const bad of ["", "abc", "3f2b8c1e-9a4d-4e6f-8b1a", undefined, 5, null]) {
      expect(isBroadcastId(bad)).toBe(false);
    }
  });
  it("idempotency key changes with the attempt generation", () => {
    expect(idempotencyKeyFor("b", "m", 0)).not.toBe(idempotencyKeyFor("b", "m", 1));
    expect(idempotencyKeyFor("b", "m", 0)).toBe("b:m:0");
  });
});
