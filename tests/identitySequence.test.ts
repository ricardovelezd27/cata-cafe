import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sequenceIdentityReload, sequenceLeaveAfterSignOut } from "@/lib/identitySequence";

describe("sequenceIdentityReload (S10 leftovers C1)", () => {
  it("runs the before-reload hooks, THEN the re-key, THEN the reload", async () => {
    const order: string[] = [];
    await sequenceIdentityReload({
      beforeReload: async () => {
        await Promise.resolve();
        order.push("hooks");
      },
      rekeyIfClaimed: async () => {
        await Promise.resolve();
        order.push("rekey");
      },
      reload: () => order.push("reload"),
    });
    expect(order).toEqual(["hooks", "rekey", "reload"]);
  });

  it("the reload waits for a slow re-key", async () => {
    const order: string[] = [];
    await sequenceIdentityReload({
      beforeReload: async () => {
        order.push("hooks");
      },
      rekeyIfClaimed: () =>
        new Promise<void>((r) =>
          setTimeout(() => {
            order.push("rekey");
            r();
          }, 15),
        ),
      reload: () => order.push("reload"),
    });
    expect(order).toEqual(["hooks", "rekey", "reload"]);
  });

  it("a failing hook or re-key still reloads, once, and never throws (the re-key is skipped after a failed hook)", async () => {
    const order: string[] = [];
    await expect(
      sequenceIdentityReload({
        beforeReload: async () => {
          order.push("hooks");
          throw new Error("x");
        },
        rekeyIfClaimed: async () => {
          order.push("rekey");
        },
        reload: () => order.push("reload"),
      }),
    ).resolves.toBeUndefined();
    expect(order).toEqual(["hooks", "reload"]);

    const order2: string[] = [];
    await sequenceIdentityReload({
      beforeReload: async () => {
        order2.push("hooks");
      },
      rekeyIfClaimed: async () => {
        order2.push("rekey");
        throw new Error("y");
      },
      reload: () => order2.push("reload"),
    });
    expect(order2).toEqual(["hooks", "rekey", "reload"]);
  });
});

describe("sequenceLeaveAfterSignOut ('No soy {nombre}', S10 leftovers C1)", () => {
  it("announces and clears the device only AFTER the sign-out succeeded, in that order", async () => {
    const order: string[] = [];
    const r = await sequenceLeaveAfterSignOut({
      signOut: async () => {
        await Promise.resolve();
        order.push("signOut");
        return { ok: true as const };
      },
      announce: () => order.push("announce"),
      clearDevice: async () => {
        await Promise.resolve();
        order.push("clear");
      },
    });
    expect(r).toEqual({ ok: true });
    expect(order).toEqual(["signOut", "announce", "clear"]);
  });

  it("a refused sign-out announces nothing and clears nothing, and returns its error", async () => {
    const order: string[] = [];
    const r = await sequenceLeaveAfterSignOut({
      signOut: async () => ({ ok: false as const, error: "unknown" as const }),
      announce: () => order.push("announce"),
      clearDevice: async () => void order.push("clear"),
    });
    expect(r).toEqual({ ok: false, error: "unknown" });
    expect(order).toEqual([]);
  });

  it("a THROWN sign-out is 'unknown' and announces nothing", async () => {
    const order: string[] = [];
    const r = await sequenceLeaveAfterSignOut({
      signOut: async () => {
        throw new Error("net");
      },
      announce: () => order.push("announce"),
      clearDevice: async () => void order.push("clear"),
    });
    expect(r).toEqual({ ok: false, error: "unknown" });
    expect(order).toEqual([]);
  });
});

describe("the real callers use the sequencers", () => {
  it("reloadIdentity goes through sequenceIdentityReload", () => {
    const src = readFileSync("lib/identityResolve.ts", "utf8");
    expect(src).toMatch(/sequenceIdentityReload\(/);
  });
  it("'No soy' goes through sequenceLeaveAfterSignOut with the server sign-out as its first step", () => {
    const src = readFileSync("components/join/GuestIdentityChoice.tsx", "utf8");
    expect(src).toMatch(/sequenceLeaveAfterSignOut\(\{[\s\S]*signOut:\s*\(\)\s*=>\s*signOut\(locale,\s*"local"\)/);
    // no direct announce/clear outside the sequencer call
    const outside = src.replace(/sequenceLeaveAfterSignOut\(\{[\s\S]*?\}\);/, "");
    expect(outside).not.toMatch(/announceIdentityLeft\(userId\)/);
    expect(outside).not.toMatch(/await clearLocalDeviceState\(\)/);
  });
});
