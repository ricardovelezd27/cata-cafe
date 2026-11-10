import { describe, expect, it } from "vitest";
import {
  CLAIM_MARKER_TTL_MS,
  decideClaimRekey,
  serializeDone,
  serializeStarted,
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
    expect(d).toEqual({ rekeyFrom: ANON, clear: true });
  });

  it("does nothing with a stale start marker, and deletes it", () => {
    const d = decideClaimRekey({
      startedRaw: serializeStarted(ANON, NOW - CLAIM_MARKER_TTL_MS - 1),
      doneRaw: serializeDone(ANON, ACCOUNT, NOW - 10_000),
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
