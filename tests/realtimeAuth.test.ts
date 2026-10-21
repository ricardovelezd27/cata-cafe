import { describe, expect, it } from "vitest";
import { subscribeWithSessionAuth, type RealtimeAuthClient } from "@/lib/supabase/realtimeAuth";

// S6 CP-C4 — a realtime channel must carry the user's JWT BEFORE it joins,
// otherwise RLS runs as `anon` and the channel silently receives nothing.

type Log = string[];

function fakeClient(token: string | null, log: Log, gate?: Promise<void>) {
  const client = {
    auth: {
      getSession: async () => {
        if (gate) await gate;
        log.push("getSession");
        return { data: { session: token ? { access_token: token } : null }, error: null };
      },
    },
    realtime: {
      setAuth: async (t?: string | null) => {
        log.push(`setAuth:${t}`);
      },
    },
    removeChannel: async () => {
      log.push("removeChannel");
      return "ok" as const;
    },
  };
  return client as unknown as RealtimeAuthClient;
}

function fakeChannel(log: Log) {
  return {
    subscribe: (cb?: (status: string) => void) => {
      log.push("subscribe");
      cb?.("SUBSCRIBED");
      return undefined as never;
    },
  } as unknown as Parameters<typeof subscribeWithSessionAuth>[1] extends () => infer C ? C : never;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("subscribeWithSessionAuth", () => {
  it("pushes the JWT to the socket before subscribing", async () => {
    const log: Log = [];
    const statuses: string[] = [];
    subscribeWithSessionAuth(
      fakeClient("jwt-123", log),
      () => {
        log.push("build");
        return fakeChannel(log);
      },
      (s) => statuses.push(s),
    );
    await tick();
    expect(log).toEqual(["getSession", "setAuth:jwt-123", "build", "subscribe"]);
    expect(statuses).toEqual(["SUBSCRIBED"]);
  });

  it("still subscribes without a session (status callback reports what Realtime says)", async () => {
    const log: Log = [];
    subscribeWithSessionAuth(fakeClient(null, log), () => fakeChannel(log));
    await tick();
    expect(log).toEqual(["getSession", "subscribe"]);
  });

  it("never builds the channel when the effect is cleaned up before the session resolves", async () => {
    const log: Log = [];
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const stop = subscribeWithSessionAuth(fakeClient("jwt", log, gate), () => {
      log.push("build");
      return fakeChannel(log);
    });
    stop();
    open();
    await tick();
    await tick();
    expect(log).toEqual(["getSession"]);
  });

  it("removes the channel on cleanup once subscribed", async () => {
    const log: Log = [];
    const stop = subscribeWithSessionAuth(fakeClient("jwt", log), () => fakeChannel(log));
    await tick();
    stop();
    expect(log.at(-1)).toBe("removeChannel");
  });
});
