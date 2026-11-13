import { describe, expect, it } from "vitest";
import { EMAIL_CHANGE_KEY, normalizeAddress, reconcileAction } from "@/lib/emailChangeRules";
import { normalizeEmail } from "@/lib/accountDeletion/plan";

const rec = (from: unknown, to: unknown) => ({ [EMAIL_CHANGE_KEY]: { from, to } });

describe("reconcileAction (S10 leftovers A1)", () => {
  it("move: the change is completed and the account's address IS the recorded `to`", () => {
    expect(reconcileAction({ email: "New@E.test", new_email: "", app_metadata: rec("old@e.test", "new@e.test") })).toBe("move");
    expect(reconcileAction({ email: "new@e.test", app_metadata: rec(" Old@e.test", "NEW@e.test") })).toBe("move");
  });

  it("keep: no record, a nulled record, or a change still in flight", () => {
    expect(reconcileAction(null)).toBe("keep");
    expect(reconcileAction({ email: "a@e.test", app_metadata: {} })).toBe("keep");
    expect(reconcileAction({ email: "a@e.test", app_metadata: { [EMAIL_CHANGE_KEY]: null } })).toBe("keep");
    expect(reconcileAction({ email: "old@e.test", new_email: "new@e.test", app_metadata: rec("old@e.test", "new@e.test") })).toBe("keep");
    // pending even when the address already equals `to` (first of two confirmations): completedEmailChange refuses, so does the move
    expect(reconcileAction({ email: "new@e.test", new_email: "x@e.test", app_metadata: rec("old@e.test", "new@e.test") })).toBe("keep");
  });

  it("clear: the record is inert", () => {
    // the request never took effect: the account still has the old address
    expect(reconcileAction({ email: "old@e.test", new_email: "", app_metadata: rec("old@e.test", "new@e.test") })).toBe("clear");
    expect(reconcileAction({ email: "old@e.test", app_metadata: rec("old@e.test", "new@e.test") })).toBe("clear");
    // the account moved on to a third address
    expect(reconcileAction({ email: "third@e.test", app_metadata: rec("old@e.test", "new@e.test") })).toBe("clear");
    // unusable records
    expect(reconcileAction({ email: "a@e.test", app_metadata: { [EMAIL_CHANGE_KEY]: "x" } })).toBe("clear");
    expect(reconcileAction({ email: "a@e.test", app_metadata: rec(1, 2) })).toBe("clear");
    expect(reconcileAction({ email: "a@e.test", app_metadata: rec("a@e.test", "a@e.test") })).toBe("clear");
    expect(reconcileAction({ email: "a@e.test", app_metadata: rec("", "a@e.test") })).toBe("clear");
  });

  it("never says move unless completedEmailChange would (a forged `to` for another address)", () => {
    expect(reconcileAction({ email: "mine@e.test", app_metadata: rec("victim@e.test", "other@e.test") })).toBe("clear");
  });
});

describe("normalizeEmail vs normalizeAddress (S10 leftovers A4: they differ ON PURPOSE, not merged)", () => {
  const table: [string, string, string][] = [
    ["plain", "A@E.test", "a@e.test"],
    ["spaces", "  A@E.test  ", "a@e.test"],
  ];
  it.each(table)("agree on %s", (_n, input, expected) => {
    expect(normalizeAddress(input)).toBe(expected);
    expect(normalizeEmail(input)).toBe(expected);
  });
  it("differ on tabs and newlines: SQL btrim() removes spaces only, JS trim() removes all whitespace", () => {
    expect(normalizeAddress("\tA@E.test\n")).toBe("\ta@e.test\n");
    expect(normalizeEmail("\tA@E.test\n")).toBe("a@e.test");
  });
});
