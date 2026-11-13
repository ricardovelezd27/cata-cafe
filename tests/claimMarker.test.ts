import { describe, expect, it } from "vitest";
import {
  CLAIM_ANON_KEY,
  CLAIM_DONE_KEY,
  CLAIM_MARKER_TTL_MS,
  claimKeysToClear,
  claimedRenderedUser,
  decideClaimRekey,
  serializeDone,
  serializeStarted,
  shouldKickReplayAfterRekey,
} from "@/lib/offline/claimMarker";

const NOW = 10_000_000;
const ANON = "anon-1";
const ACCOUNT = "acct-1";

describe("decideClaimRekey", () => {
  it("re-keys a fresh start marker with a matching completion for this account", () => {
    const d = decideClaimRekey({
      startedRaw: serializeStarted(ANON, NOW - 60_000),
      doneRaw: serializeDone(ANON, ACCOUNT, NOW - 10_000),
      userId: ACCOUNT,
      now: NOW,
    });
    expect(d).toEqual({ rekeyFrom: ANON, clear: false });
  });

  it("a claim that never completed expires from its START marker and is deleted", () => {
    const d = decideClaimRekey({
      startedRaw: serializeStarted(ANON, NOW - CLAIM_MARKER_TTL_MS - 1),
      doneRaw: null,
      userId: ACCOUNT,
      now: NOW,
    });
    expect(d).toEqual({ rekeyFrom: null, clear: true });
  });

  it("a COMPLETED claim is as old as its DONE marker: an old start does not expire it (WP8b)", () => {
    const d = decideClaimRekey({
      startedRaw: serializeStarted(ANON, NOW - 3 * CLAIM_MARKER_TTL_MS),
      doneRaw: serializeDone(ANON, ACCOUNT, NOW - 10_000),
      userId: ACCOUNT,
      now: NOW,
    });
    expect(d).toEqual({ rekeyFrom: ANON, clear: false });
  });

  it("a stale DONE marker expires the claim even with a fresh start", () => {
    const d = decideClaimRekey({
      startedRaw: serializeStarted(ANON, NOW - 1000),
      doneRaw: serializeDone(ANON, ACCOUNT, NOW - CLAIM_MARKER_TTL_MS - 1),
      userId: ACCOUNT,
      now: NOW,
    });
    expect(d).toEqual({ rekeyFrom: null, clear: true });
  });

  it("does not hand drafts to a different account", () => {
    const d = decideClaimRekey({
      startedRaw: serializeStarted(ANON, NOW - 1000),
      doneRaw: serializeDone(ANON, ACCOUNT, NOW - 500),
      userId: "someone-else",
      now: NOW,
    });
    expect(d.rekeyFrom).toBeNull();
  });

  it("does nothing without a completion marker (abandoned login)", () => {
    const d = decideClaimRekey({
      startedRaw: serializeStarted(ANON, NOW - 1000),
      doneRaw: null,
      userId: ACCOUNT,
      now: NOW,
    });
    expect(d).toEqual({ rekeyFrom: null, clear: false });
  });

  it("ignores a completion for a different anonymous id", () => {
    const d = decideClaimRekey({
      startedRaw: serializeStarted(ANON, NOW - 1000),
      doneRaw: serializeDone("anon-2", ACCOUNT, NOW - 500),
      userId: ACCOUNT,
      now: NOW,
    });
    expect(d.rekeyFrom).toBeNull();
  });

  it("drops the legacy bare-id marker and garbage", () => {
    for (const startedRaw of ["anon-1", "{", "[]", JSON.stringify({ anonId: 5, at: 1 })]) {
      expect(
        decideClaimRekey({ startedRaw, doneRaw: null, userId: ACCOUNT, now: NOW }),
      ).toEqual({ rekeyFrom: null, clear: true });
    }
  });

  it("no markers: nothing to do", () => {
    expect(
      decideClaimRekey({ startedRaw: null, doneRaw: null, userId: ACCOUNT, now: NOW }),
    ).toEqual({ rekeyFrom: null, clear: false });
  });
});

describe("claimKeysToClear (C-08)", () => {
  it("a plain sign-out drops both markers", () => {
    expect(claimKeysToClear()).toEqual([CLAIM_ANON_KEY, CLAIM_DONE_KEY]);
  });

  it("switching account mid-claim keeps the anonymous-id marker", () => {
    expect(claimKeysToClear({ keepClaimInProgress: true })).toEqual([CLAIM_DONE_KEY]);
  });

  it("the kept marker still re-keys once the other account confirms", () => {
    const d = decideClaimRekey({
      startedRaw: serializeStarted(ANON, NOW - 60_000),
      doneRaw: serializeDone(ANON, "acct-2", NOW - 10_000),
      userId: "acct-2",
      now: NOW,
    });
    expect(d).toEqual({ rekeyFrom: ANON, clear: false });
  });
});

describe("markers survive a re-key (fourth review)", () => {
  it("the same fresh markers keep asking for the re-key on every later mount", () => {
    const input = {
      startedRaw: serializeStarted(ANON, NOW - 60_000),
      doneRaw: serializeDone(ANON, ACCOUNT, NOW - 10_000),
      userId: ACCOUNT,
    };
    expect(decideClaimRekey({ ...input, now: NOW })).toEqual({ rekeyFrom: ANON, clear: false });
    expect(decideClaimRekey({ ...input, now: NOW + 30 * 60_000 })).toEqual({ rekeyFrom: ANON, clear: false });
  });

  it("they expire by TTL", () => {
    const d = decideClaimRekey({
      startedRaw: serializeStarted(ANON, NOW - 60_000),
      doneRaw: serializeDone(ANON, ACCOUNT, NOW - 10_000),
      userId: ACCOUNT,
      now: NOW + CLAIM_MARKER_TTL_MS,
    });
    expect(d.rekeyFrom).toBeNull();
    expect(d.clear).toBe(true);
  });
});

describe("marker TTL and expiry on read (S10 leftovers C3)", () => {
  const input = (age: number) => ({
    startedRaw: serializeStarted(ANON, NOW - age),
    doneRaw: serializeDone(ANON, ACCOUNT, NOW - age),
    userId: ACCOUNT,
    now: NOW,
  });
  it("the TTL is exactly one hour", () => {
    expect(CLAIM_MARKER_TTL_MS).toBe(3_600_000);
  });
  it("a completion marker is fresh up to and including the TTL and stale one millisecond later", () => {
    expect(decideClaimRekey(input(CLAIM_MARKER_TTL_MS))).toEqual({ rekeyFrom: ANON, clear: false });
    expect(decideClaimRekey(input(CLAIM_MARKER_TTL_MS + 1))).toEqual({ rekeyFrom: null, clear: true });
  });
  it("an expired marker is reported for removal on read (the provider removes both keys), even for another user", () => {
    expect(decideClaimRekey({ ...input(CLAIM_MARKER_TTL_MS + 1), userId: "someone-else" })).toEqual({ rekeyFrom: null, clear: true });
    // a marker stamped in the future is not fresh either
    expect(decideClaimRekey(input(-1)).rekeyFrom).toBeNull();
  });
});

describe("shouldKickReplayAfterRekey (S10 leftovers C2)", () => {
  it("kicks once when the re-key moved something, never when it moved nothing, never twice", () => {
    expect(shouldKickReplayAfterRekey(2, false)).toBe(true);
    expect(shouldKickReplayAfterRekey(0, false)).toBe(false);
    expect(shouldKickReplayAfterRekey(2, true)).toBe(false);
    expect(shouldKickReplayAfterRekey(Number.NaN, false)).toBe(false);
    expect(shouldKickReplayAfterRekey(-1, false)).toBe(false);
  });
  it("the guard cannot loop: once the flag is set no later call kicks", () => {
    let kicked = false;
    let kicks = 0;
    for (const moved of [3, 3, 5, 1]) {
      if (shouldKickReplayAfterRekey(moved, kicked)) {
        kicked = true;
        kicks += 1;
      }
    }
    expect(kicks).toBe(1);
  });
});

describe("claimedRenderedUser", () => {
  const base = {
    renderedUserId: ANON,
    currentUserId: ACCOUNT,
    startedRaw: serializeStarted(ANON, NOW - 60_000),
    doneRaw: serializeDone(ANON, ACCOUNT, NOW - 10_000),
    now: NOW,
  };
  it("true when the completion says the rendered id was claimed by the current user", () => {
    expect(claimedRenderedUser(base)).toBe(true);
  });
  it("false without a completion marker (claim started, not finished)", () => {
    expect(claimedRenderedUser({ ...base, doneRaw: null })).toBe(false);
  });
  it("false without a start marker", () => {
    expect(claimedRenderedUser({ ...base, startedRaw: null })).toBe(false);
  });
  it("false when another account is signed in", () => {
    expect(claimedRenderedUser({ ...base, currentUserId: "acct-2" })).toBe(false);
  });
  it("false when the tab was rendered for someone else", () => {
    expect(claimedRenderedUser({ ...base, renderedUserId: "anon-2" })).toBe(false);
  });
  it("false when rendered and current are the same user", () => {
    expect(claimedRenderedUser({ ...base, currentUserId: ANON })).toBe(false);
  });
  it("false once the markers are stale", () => {
    expect(claimedRenderedUser({ ...base, now: NOW + CLAIM_MARKER_TTL_MS + 1 })).toBe(false);
  });
  it("true when the claim STARTED over an hour ago but finished recently (WP8b)", () => {
    expect(
      claimedRenderedUser({ ...base, startedRaw: serializeStarted(ANON, NOW - 5 * CLAIM_MARKER_TTL_MS) }),
    ).toBe(true);
  });
});
