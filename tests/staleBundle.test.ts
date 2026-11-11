import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isStaleBundle,
  isStaleBundleError,
  markStaleBundle,
  noteIfStaleBundle,
  onStaleBundle,
  resetStaleBundleForTests,
} from "@/lib/staleBundle";

// S9-01 C-06: the error shape comes from Next 16's server-action-reducer
// (UnrecognizedActionError, message `Server Action "<id>" was not found on
// the server.`).

describe("isStaleBundleError", () => {
  it("recognises Next's UnrecognizedActionError by name", () => {
    const e = new Error("x");
    e.name = "UnrecognizedActionError";
    expect(isStaleBundleError(e)).toBe(true);
  });

  it("recognises the message when the class came from another chunk", () => {
    expect(
      isStaleBundleError(
        new Error('Server Action "40abc123" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'),
      ),
    ).toBe(true);
  });

  it("ignores everything else", () => {
    expect(isStaleBundleError(new Error("Failed to fetch"))).toBe(false);
    expect(isStaleBundleError(new Error("session_closed"))).toBe(false);
    expect(isStaleBundleError(null)).toBe(false);
    expect(isStaleBundleError("Server Action")).toBe(false);
    expect(isStaleBundleError(undefined)).toBe(false);
  });
});

describe("stale flag", () => {
  beforeEach(() => resetStaleBundleForTests());

  it("starts clear, latches once, and notifies subscribers once", () => {
    const fn = vi.fn();
    onStaleBundle(fn);
    expect(isStaleBundle()).toBe(false);
    markStaleBundle();
    markStaleBundle();
    expect(isStaleBundle()).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("noteIfStaleBundle only latches on the stale error", () => {
    expect(noteIfStaleBundle(new Error("boom"))).toBe(false);
    expect(isStaleBundle()).toBe(false);
    expect(noteIfStaleBundle(new Error('Server Action "x" was not found on the server.'))).toBe(true);
    expect(isStaleBundle()).toBe(true);
  });
});
