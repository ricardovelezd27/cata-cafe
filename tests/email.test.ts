import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyResendStatus, parseRetryAfterMs, sendEmail } from "@/lib/email";

describe("email status helpers", () => {
  it("classifies HTTP statuses", () => {
    expect(classifyResendStatus(429)).toBe("resend_429");
    expect(classifyResendStatus(500)).toBe("resend_5xx");
    expect(classifyResendStatus(503)).toBe("resend_5xx");
    expect(classifyResendStatus(422)).toBe("resend_4xx");
  });
  it("parses Retry-After seconds", () => {
    expect(parseRetryAfterMs("2")).toBe(2000);
    expect(parseRetryAfterMs("0.5")).toBe(500);
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs("soon")).toBeUndefined();
  });
});

describe("sendEmail (mocked fetch)", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.RESEND_API_KEY;
  });

  const args = { to: "x@example.com", subject: "s", html: "<p>h</p>" };

  it("sends an Idempotency-Key header only when one is given", async () => {
    const calls: Array<Record<string, string>> = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls.push(init?.headers as Record<string, string>);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    expect((await sendEmail(args)).ok).toBe(true);
    expect((await sendEmail({ ...args, idempotencyKey: "k:1:0" })).ok).toBe(true);
    expect(calls[0]["Idempotency-Key"]).toBeUndefined();
    expect(calls[1]["Idempotency-Key"]).toBe("k:1:0");
  });

  it("returns status, retry-after and a code on a 429", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("slow down", { status: 429, headers: { "retry-after": "3" } }),
    ) as unknown as typeof fetch;
    const res = await sendEmail(args);
    expect(res).toMatchObject({ ok: false, status: 429, retryAfterMs: 3000, code: "resend_429" });
  });

  it("flags a thrown fetch as a network failure", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    expect(await sendEmail(args)).toMatchObject({ ok: false, code: "network" });
  });
});
