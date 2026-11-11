import { describe, expect, it } from "vitest";
import {
  CLOSE_EMAIL_LEASE_MS,
  hasClaimableRecipient,
  isClaimable,
  leaseCutoff,
  mustRecordFinalOutcome,
} from "@/lib/closeEmailLedger";

// S9-01 B-08: the close-email ledger reserves a recipient ("sending") before
// the send. A reservation is a lease; a crashed run's row is retriable.

const NOW = 1_000_000_000_000;
const row = (status: string, agoMs = 0) => ({ status, updatedAt: NOW - agoMs });

describe("isClaimable", () => {
  it("takes a recipient with no row", () => {
    expect(isClaimable(null, NOW)).toBe(true);
  });

  it("never re-sends a sent row, however old", () => {
    expect(isClaimable(row("sent"), NOW)).toBe(false);
    expect(isClaimable(row("sent", 30 * 24 * 3_600_000), NOW)).toBe(false);
  });

  it("retries failed and skipped rows", () => {
    expect(isClaimable(row("failed"), NOW)).toBe(true);
    expect(isClaimable(row("skipped"), NOW)).toBe(true);
  });

  it("holds a fresh reservation but takes over an abandoned one", () => {
    expect(isClaimable(row("sending", 1_000), NOW)).toBe(false);
    expect(isClaimable(row("sending", CLOSE_EMAIL_LEASE_MS - 1), NOW)).toBe(false);
    expect(isClaimable(row("sending", CLOSE_EMAIL_LEASE_MS), NOW)).toBe(true);
    expect(isClaimable(row("sending", CLOSE_EMAIL_LEASE_MS * 5), NOW)).toBe(true);
  });

  it("refuses a status it does not know", () => {
    expect(isClaimable(row("weird"), NOW)).toBe(false);
  });
});

describe("leaseCutoff", () => {
  it("is now minus the lease", () => {
    expect(leaseCutoff(NOW)).toBe(NOW - CLOSE_EMAIL_LEASE_MS);
  });
});

describe("hasClaimableRecipient", () => {
  const ledger = (entries: [string, ReturnType<typeof row>][]) => new Map(entries);

  it("is false with no recipients", () => {
    expect(hasClaimableRecipient([], ledger([]), NOW)).toBe(false);
  });

  it("is true when someone has no row yet", () => {
    expect(hasClaimableRecipient(["a", "b"], ledger([["a", row("sent")]]), NOW)).toBe(true);
  });

  it("is false when everyone is sent or held by a fresh lease", () => {
    const l = ledger([["a", row("sent")], ["b", row("sending", 1_000)]]);
    expect(hasClaimableRecipient(["a", "b"], l, NOW)).toBe(false);
  });

  it("is true when a failed, skipped or expired-lease row exists", () => {
    expect(hasClaimableRecipient(["a"], ledger([["a", row("failed")]]), NOW)).toBe(true);
    expect(hasClaimableRecipient(["a"], ledger([["a", row("skipped")]]), NOW)).toBe(true);
    expect(
      hasClaimableRecipient(["a"], ledger([["a", row("sending", CLOSE_EMAIL_LEASE_MS)]]), NOW),
    ).toBe(true);
  });

  it("ignores ledger rows of users who are not recipients", () => {
    const l = ledger([["a", row("sent")], ["z", row("failed")]]);
    expect(hasClaimableRecipient(["a"], l, NOW)).toBe(false);
  });
});

describe("mustRecordFinalOutcome", () => {
  it("forces only a real send", () => {
    expect(mustRecordFinalOutcome("sent")).toBe(true);
    expect(mustRecordFinalOutcome("failed")).toBe(false);
    expect(mustRecordFinalOutcome("skipped")).toBe(false);
  });
});
