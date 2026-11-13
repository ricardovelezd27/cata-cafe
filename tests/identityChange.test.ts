import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearIdentityChanged,
  hasIdentityNoticeHost,
  isIdentityChanged,
  markIdentityChanged,
  onIdentityChanged,
  registerBeforeIdentityReload,
  registerIdentityNoticeHost,
  resetIdentityChangedForTests,
  runBeforeIdentityReload,
} from "@/lib/identityChange";

beforeEach(() => resetIdentityChangedForTests());

describe("identity latch", () => {
  it("latches once and notifies once", () => {
    const l = vi.fn();
    onIdentityChanged(l);
    markIdentityChanged();
    markIdentityChanged();
    expect(isIdentityChanged()).toBe(true);
    expect(l).toHaveBeenCalledTimes(1);
  });

  it("clears when the same user is seen again", () => {
    const l = vi.fn();
    markIdentityChanged();
    onIdentityChanged(l);
    clearIdentityChanged();
    clearIdentityChanged();
    expect(isIdentityChanged()).toBe(false);
    expect(l).toHaveBeenCalledTimes(1);
  });
});

describe("notice host", () => {
  it("counts hosts and unregisters", () => {
    expect(hasIdentityNoticeHost()).toBe(false);
    const off = registerIdentityNoticeHost();
    expect(hasIdentityNoticeHost()).toBe(true);
    off();
    expect(hasIdentityNoticeHost()).toBe(false);
  });
});

describe("before-reload hooks", () => {
  it("awaits every hook", async () => {
    const order: string[] = [];
    registerBeforeIdentityReload(async () => {
      await Promise.resolve();
      order.push("a");
    });
    registerBeforeIdentityReload(async () => {
      order.push("b");
    });
    await runBeforeIdentityReload();
    expect(order.sort()).toEqual(["a", "b"]);
  });

  it("never throws and never waits past the cap", async () => {
    registerBeforeIdentityReload(async () => {
      throw new Error("boom");
    });
    registerBeforeIdentityReload(() => new Promise<void>(() => {}));
    await expect(runBeforeIdentityReload(20)).resolves.toBeUndefined();
  });
});
