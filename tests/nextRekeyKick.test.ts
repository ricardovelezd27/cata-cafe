import { describe, expect, it } from "vitest";
import { nextRekeyKick } from "@/lib/offline/claimMarker";

describe("nextRekeyKick (mark as kicked, then kick: one pair)", () => {
  it("returns kicked=true and kick=true once when something moved", () => {
    expect(nextRekeyKick(3, false)).toEqual({ kicked: true, kick: true });
  });
  it("never kicks again once marked, and a re-key that moved nothing keeps the flag", () => {
    expect(nextRekeyKick(3, true)).toEqual({ kicked: true, kick: false });
    expect(nextRekeyKick(0, false)).toEqual({ kicked: false, kick: false });
  });
  it("threading the returned flag through repeated calls kicks exactly once", () => {
    let kicked = false;
    let kicks = 0;
    for (const moved of [0, 2, 2, 5]) {
      const n = nextRekeyKick(moved, kicked);
      kicked = n.kicked;
      if (n.kick) kicks += 1;
    }
    expect(kicks).toBe(1);
  });
});
