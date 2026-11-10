import { beforeAll, describe, expect, it } from "vitest";
import {
  CLAIM_TTL_MS,
  anonEvalWins,
  resolveEvalConflicts,
  needsAggregateRefire,
  mintGuestClaimToken,
  safeClaimBack,
  verifyGuestClaimToken,
  type ClaimEvalRow,
} from "../lib/guestClaimToken";

beforeAll(() => {
  process.env.GUEST_CLAIM_SECRET = "test-secret-for-claims";
});

const T0 = Date.UTC(2026, 10, 1);

describe("guest claim token", () => {
  it("round-trips the anonymous id and issue time", () => {
    const token = mintGuestClaimToken("anon-1", T0);
    const v = verifyGuestClaimToken(token, T0 + 1000);
    expect(v).toEqual({ anonymousUserId: "anon-1", issuedAt: new Date(T0), expired: false });
  });

  it("is genuine-but-expired after 7 days, still valid at the boundary", () => {
    const token = mintGuestClaimToken("anon-1", T0);
    expect(verifyGuestClaimToken(token, T0 + CLAIM_TTL_MS)?.expired).toBe(false);
    expect(verifyGuestClaimToken(token, T0 + CLAIM_TTL_MS + 1)?.expired).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const token = mintGuestClaimToken("anon-1", T0);
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ a: "victim", iat: T0, exp: T0 + CLAIM_TTL_MS })).toString("base64url");
    expect(verifyGuestClaimToken(`${forged}.${sig}`, T0)).toBeNull();
    expect(verifyGuestClaimToken(`${payload}.${sig}x`, T0)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = mintGuestClaimToken("anon-1", T0);
    process.env.GUEST_CLAIM_SECRET = "another-secret";
    expect(verifyGuestClaimToken(token, T0)).toBeNull();
    process.env.GUEST_CLAIM_SECRET = "test-secret-for-claims";
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "abc", ".", "a.", ".b", "not.a.token.at.all"]) {
      expect(verifyGuestClaimToken(bad, T0)).toBeNull();
    }
  });

  it("rejects a correctly signed payload with the wrong shape", async () => {
    const { createHmac } = await import("node:crypto");
    const payloadB64 = Buffer.from(JSON.stringify({ a: 5, iat: "x" })).toString("base64url");
    const sig = createHmac("sha256", "test-secret-for-claims").update(payloadB64).digest("base64url");
    expect(verifyGuestClaimToken(`${payloadB64}.${sig}`, T0)).toBeNull();
  });

  it("replay is a pure function: the same token verifies twice (the anonymous-user check lives in the merge)", () => {
    const token = mintGuestClaimToken("anon-1", T0);
    expect(verifyGuestClaimToken(token, T0)).not.toBeNull();
    expect(verifyGuestClaimToken(token, T0)).not.toBeNull();
  });
});

describe("safeClaimBack", () => {
  it("keeps in-app paths of the same locale", () => {
    expect(safeClaimBack("es", "/es/app/sessions/1/results")).toBe("/es/app/sessions/1/results");
  });
  it("falls back for other locales, origins and empty", () => {
    expect(safeClaimBack("es", "/en/app/x")).toBe("/es/app");
    expect(safeClaimBack("en", "https://evil.test/en/app/x")).toBe("/en/app");
    expect(safeClaimBack("en", undefined)).toBe("/en/app");
    expect(safeClaimBack("xx", "/es/app/x")).toBe("/es/app/x");
  });
});

describe("anonEvalWins", () => {
  const row = (over: Partial<ClaimEvalRow>): ClaimEvalRow => ({
    id: "e",
    sessionSampleId: "s",
    isDraft: false,
    submittedAt: new Date(T0),
    updatedAt: new Date(T0),
    ...over,
  });

  it("a submitted evaluation beats a draft, either way round", () => {
    expect(anonEvalWins(row({ isDraft: false }), row({ isDraft: true, submittedAt: null }))).toBe(true);
    expect(anonEvalWins(row({ isDraft: true, submittedAt: null }), row({ isDraft: false }))).toBe(false);
  });

  it("among two submitted, the most recent wins; a tie keeps the target", () => {
    expect(anonEvalWins(row({ submittedAt: new Date(T0 + 5) }), row({}))).toBe(true);
    expect(anonEvalWins(row({}), row({ submittedAt: new Date(T0 + 5) }))).toBe(false);
    expect(anonEvalWins(row({}), row({}))).toBe(false);
  });

  it("among two drafts, updatedAt decides", () => {
    const d = (t: number) => row({ isDraft: true, submittedAt: null, updatedAt: new Date(t) });
    expect(anonEvalWins(d(T0 + 1), d(T0))).toBe(true);
    expect(anonEvalWins(d(T0), d(T0 + 1))).toBe(false);
  });
});

describe("needsAggregateRefire", () => {
  const base = {
    guestExcluded: false,
    guestHadRow: false,
    accountExcluded: false,
    accountHadRow: false,
    guestHasEvaluations: false,
  };
  it("re-fires when guest evaluations land on an excluded account (guest no row / not excluded)", () => {
    expect(
      needsAggregateRefire({ ...base, accountHadRow: true, accountExcluded: true, guestHasEvaluations: true }),
    ).toBe(true);
    expect(
      needsAggregateRefire({
        ...base,
        guestHadRow: true,
        accountHadRow: true,
        accountExcluded: true,
        guestHasEvaluations: true,
      }),
    ).toBe(true);
  });
  it("re-fires when the guest was excluded and the account was not", () => {
    expect(
      needsAggregateRefire({ ...base, guestHadRow: true, guestExcluded: true, accountHadRow: true }),
    ).toBe(true);
    expect(
      needsAggregateRefire({ ...base, guestHadRow: true, guestExcluded: true, guestHasEvaluations: true }),
    ).toBe(false); // flag moves with the row, evaluations counted under it already
  });
  it("does nothing without evaluations on an excluded account", () => {
    expect(needsAggregateRefire({ ...base, accountHadRow: true, accountExcluded: true })).toBe(false);
  });
  it("matches an oracle across every combination", () => {
    const bools = [false, true];
    for (const guestExcluded of bools)
      for (const guestHadRow of bools)
        for (const accountExcluded of bools)
          for (const accountHadRow of bools)
            for (const guestHasEvaluations of bools) {
              if (!guestHadRow && guestExcluded) continue; // impossible
              if (!accountHadRow && accountExcluded) continue;
              const surviving = (guestHadRow && guestExcluded) || (accountHadRow && accountExcluded);
              const movedChanged = guestHasEvaluations && surviving !== (guestHadRow && guestExcluded);
              const ownChanged = accountHadRow && guestHadRow && surviving !== accountExcluded;
              expect(
                needsAggregateRefire({
                  guestExcluded,
                  guestHadRow,
                  accountExcluded,
                  accountHadRow,
                  guestHasEvaluations,
                }),
              ).toBe(movedChanged || ownChanged);
            }
  });
});

describe("resolveEvalConflicts", () => {
  const r = (id: string, over: Partial<ClaimEvalRow> = {}): ClaimEvalRow => ({
    id,
    sessionSampleId: "s",
    isDraft: false,
    submittedAt: new Date(T0),
    updatedAt: new Date(T0),
    ...over,
  });
  it("guest wins: account evaluation is deleted and flagged for label-row drop", () => {
    const out = resolveEvalConflicts([{ anon: r("g", { submittedAt: new Date(T0 + 9) }), target: r("a") }]);
    expect(out.deleteIds).toEqual(["a"]);
    expect(out.accountLoserIds).toEqual(["a"]);
  });
  it("account wins: guest evaluation deleted, account label row untouched", () => {
    const out = resolveEvalConflicts([{ anon: r("g"), target: r("a") }]);
    expect(out.deleteIds).toEqual(["g"]);
    expect(out.accountLoserIds).toEqual([]);
  });
});
