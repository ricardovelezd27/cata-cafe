import { describe, expect, it } from "vitest";
import { cupExitHref, exitDecision, moduleAction, shouldShowClosedNotice } from "@/lib/cupExit";

// Package S5a (C-02, J-04): the cupping screen's ways out. Pure rules.

describe("C-02: the module switcher never submits", () => {
  it("'Resultados' is a way out to the results page, in every state", () => {
    expect(moduleAction("results")).toEqual({ kind: "leave", target: "results" });
  });
  it("the evaluation modules switch tabs; anything else does nothing", () => {
    expect(moduleAction("cupping")).toEqual({ kind: "tab", tab: "cupping" });
    expect(moduleAction("physical")).toEqual({ kind: "tab", tab: "physical" });
    expect(moduleAction("extrinsic")).toEqual({ kind: "tab", tab: "extrinsic" });
    expect(moduleAction("submit")).toEqual({ kind: "none" });
    expect(moduleAction("")).toEqual({ kind: "none" });
  });
});

describe("J-04: one guarded exit", () => {
  const base = { flushed: "synced" as const, hasPending: false, localPending: 0, sessionClosed: false };
  it("nothing pending: leave at once", () => {
    expect(exitDecision(base)).toBe("leave");
  });
  it("a save still device-only after the flush (offline, failed save, identity changed): ask first", () => {
    expect(exitDecision({ ...base, flushed: "pending" })).toBe("confirm");
    expect(exitDecision({ ...base, hasPending: true })).toBe("confirm");
    expect(exitDecision({ ...base, localPending: 2 })).toBe("confirm");
  });
  it("a closed session never asks: its drafts are handled as closed_unsent, the page leaves anyway", () => {
    expect(exitDecision({ ...base, sessionClosed: true, flushed: "pending", hasPending: true, localPending: 3 })).toBe("leave");
  });
  it("each way out goes where it says", () => {
    expect(cupExitHref("es", "s1", "sessions")).toBe("/es/app/sessions");
    expect(cupExitHref("en", "s1", "results")).toBe("/en/app/sessions/s1/results");
  });
});

describe("J-04: 'La sesión se cerró' before the redirect", () => {
  it("a participant sees it once when the session row says closed", () => {
    expect(shouldShowClosedNotice({ status: "closed" }, { isOwner: false, alreadyShown: false })).toBe(true);
    expect(shouldShowClosedNotice({ status: "closed" }, { isOwner: false, alreadyShown: true })).toBe(false);
  });
  it("never for the owner (they closed it) and never for another change of the row", () => {
    expect(shouldShowClosedNotice({ status: "closed" }, { isOwner: true, alreadyShown: false })).toBe(false);
    expect(shouldShowClosedNotice({ status: "active" }, { isOwner: false, alreadyShown: false })).toBe(false);
    expect(shouldShowClosedNotice({ referenceSampleId: "x" }, { isOwner: false, alreadyShown: false })).toBe(false);
  });
});
