import { describe, expect, it } from "vitest";
import { replayUserMismatch } from "@/lib/offline/replayGuard";

describe("replayUserMismatch", () => {
  it("absent expected user = legacy behaviour", () => {
    expect(replayUserMismatch(undefined, "b")).toBe(false);
  });
  it("same user writes", () => {
    expect(replayUserMismatch("a", "a")).toBe(false);
  });
  it("a different signed-in user writes nothing", () => {
    expect(replayUserMismatch("a", "b")).toBe(true);
  });
});
