import { describe, expect, it } from "vitest";
import { cupSampleIndexFrom, cupStepIndexFrom, writeCupPlace, writePlaceToHistory } from "@/lib/cupPlace";
import { sameSearch } from "@/lib/viewAddress";

// P5b (D-01): the cup page's sample and step in the address, read once, written from the state.

describe("cupStepIndexFrom: strict, 1-based", () => {
  it("reads 1..stepCount as 0..stepCount-1", () => {
    expect(cupStepIndexFrom("1", 5)).toBe(0);
    expect(cupStepIndexFrom("5", 5)).toBe(4);
  });
  it("ignores anything else (the page starts at the first step)", () => {
    for (const v of [null, undefined, "", "0", "6", "-1", "1.5", "2x", " 2", "999", "abc"]) {
      expect(cupStepIndexFrom(v as string | null | undefined, 5), String(v)).toBe(0);
    }
  });
});

describe("cupSampleIndexFrom: only the page's own samples", () => {
  const ids = ["a1", "b2", "c3"];
  it("finds a known sample", () => {
    expect(cupSampleIndexFrom("c3", ids)).toBe(2);
  });
  it("an unknown or empty value is the first sample", () => {
    expect(cupSampleIndexFrom("zz", ids)).toBe(0);
    expect(cupSampleIndexFrom("", ids)).toBe(0);
    expect(cupSampleIndexFrom(null, ids)).toBe(0);
  });
});

describe("writeCupPlace: the state written into the query", () => {
  it("writes the sample id and the 1-based step", () => {
    expect(sameSearch(writeCupPlace("", "b2", 1), "?sample=b2&step=2")).toBe(true);
  });
  it("replaces an unknown value and keeps other keys", () => {
    expect(sameSearch(writeCupPlace("?sample=zz&step=9&x=1", "a1", 0), "?x=1&sample=a1&step=1")).toBe(true);
  });
  it("drops a key it cannot write", () => {
    expect(sameSearch(writeCupPlace("?sample=a1&step=2", null, -1), "")).toBe(true);
  });
});

// The bug Ricardo found on his phone (2026-11-19): the place was written into the address
// bar, but Next's router never learned it, and its next refresh (every 30 s in a group
// session, and on every resume) wrote the old URL back, so a reload opened step 1.
// This stand-in copies Next 16's patched replaceState rule (node_modules/next/dist/client/
// components/app-router.js): a state that already carries `__NA` bypasses the router.
function nextLikeHost(initialSearch: string) {
  const routerUrl = { search: initialSearch };
  const host = {
    location: { pathname: "/app/sessions/s1/cup", search: initialSearch, hash: "" },
    history: {
      state: { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { t: 1 }, cataCupSentinel: true } as Record<string, unknown>,
      replaceState(data: unknown, _u: string, url?: string | null) {
        const d = (data ?? {}) as Record<string, unknown>;
        const search = url ? new URL(url, "http://x").search : host.location.search;
        if (d.__NA || d._N) {
          host.location.search = search; // the bar changes, the router does not
          host.history.state = d;
          return;
        }
        // Next copies its own keys back and moves its router to the new URL
        host.history.state = { ...d, __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { t: 1 } };
        routerUrl.search = search;
        host.location.search = search;
      },
    },
  };
  // a router.refresh(): Next writes its canonical URL back into the bar
  const refresh = () => { host.location.search = routerUrl.search; };
  return { host, refresh, routerUrl };
}

describe("writePlaceToHistory: the place survives the router's refresh (the phone bug)", () => {
  it("the old call (passing Next's own state back) loses the place after a refresh", () => {
    const { host, refresh } = nextLikeHost("");
    const next = writeCupPlace(host.location.search, "b2", 2);
    host.history.replaceState(host.history.state, "", `${host.location.pathname}${next}`);
    expect(host.location.search).toBe("?sample=b2&step=3");
    refresh();
    expect(host.location.search).toBe(""); // what Ricardo saw: a reload then opened step 1
  });
  it("writePlaceToHistory moves the router too, so a refresh keeps the place", () => {
    const { host, refresh, routerUrl } = nextLikeHost("");
    expect(writePlaceToHistory(host, "b2", 2)).toBe(true);
    expect(routerUrl.search).toBe("?sample=b2&step=3");
    refresh();
    expect(sameSearch(host.location.search, "?sample=b2&step=3")).toBe(true);
  });
  it("keeps the entry's own state (the back trap's sentinel) and never hands Next's keys back", () => {
    const calls: unknown[] = [];
    const host = {
      location: { pathname: "/p", search: "", hash: "" },
      history: { state: { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {}, _N: 1, cataCupSentinel: true }, replaceState: (d: unknown) => { calls.push(d); } },
    };
    writePlaceToHistory(host, "a1", 0);
    expect(calls).toEqual([{ cataCupSentinel: true }]);
  });
  it("writes nothing when the address already holds the place", () => {
    const calls: unknown[] = [];
    const host = { location: { pathname: "/p", search: "?sample=a1&step=1", hash: "" }, history: { state: null, replaceState: (d: unknown) => { calls.push(d); } } };
    expect(writePlaceToHistory(host, "a1", 0)).toBe(false);
    expect(calls).toEqual([]);
  });
});
