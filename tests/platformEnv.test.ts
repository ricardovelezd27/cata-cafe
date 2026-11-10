import { describe, expect, it } from "vitest";
import { isNativeShell, isStandalone } from "@/lib/platform/env";
import { openReport } from "@/lib/platform/openReport";
import { downloadFile } from "@/lib/platform/files";
import { printPage } from "@/lib/platform/print";
import { openExternal } from "@/lib/platform/external";
import { pdfDisposition } from "@/lib/pdf/disposition";

describe("isNativeShell", () => {
  it("is false without a window (SSR) and on the plain web", () => {
    expect(isNativeShell(undefined)).toBe(false);
    expect(isNativeShell({})).toBe(false);
    expect(isNativeShell({ Capacitor: {} })).toBe(false);
  });
  it("is true only when Capacitor says native", () => {
    expect(isNativeShell({ Capacitor: { isNativePlatform: () => true } })).toBe(true);
    expect(isNativeShell({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
  });
  it("never throws if the bridge does", () => {
    expect(
      isNativeShell({
        Capacitor: {
          isNativePlatform: () => {
            throw new Error("boom");
          },
        },
      }),
    ).toBe(false);
  });
});

describe("isStandalone", () => {
  it("detects iOS standalone, display-mode and the shell", () => {
    expect(isStandalone({ navigator: { standalone: true } })).toBe(true);
    expect(isStandalone({ matchMedia: () => ({ matches: true }) })).toBe(true);
    expect(isStandalone({ Capacitor: { isNativePlatform: () => true } })).toBe(true);
    expect(isStandalone({ matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(isStandalone(undefined)).toBe(false);
  });
});

describe("helpers never throw and report { ok, via }", () => {
  it("openReport returns offline WITHOUT fetching", async () => {
    let called = false;
    const orig = globalThis.fetch;
    globalThis.fetch = (() => {
      called = true;
      return Promise.reject(new Error("no"));
    }) as typeof fetch;
    try {
      expect(await openReport("/x.pdf", "x.pdf", { online: false })).toEqual({ ok: false, via: "offline" });
      expect(called).toBe(false);
      // online but the network fails: resolves, does not throw
      expect((await openReport("/x.pdf", "x.pdf", { online: true })).ok).toBe(false);
    } finally {
      globalThis.fetch = orig;
    }
  });
  it("is a quiet no-op on the server", () => {
    expect(downloadFile({ text: "a", filename: "a.txt" })).toEqual({ ok: false, via: "none" });
    expect(printPage()).toEqual({ ok: false, via: "none" });
    expect(openExternal("https://example.com")).toEqual({ ok: false, via: "none" });
  });
});

describe("pdfDisposition", () => {
  it("honours ?inline=1", () => {
    expect(pdfDisposition(true, "a.pdf")).toBe('inline; filename="a.pdf"');
    expect(pdfDisposition(false, "a.pdf")).toBe('attachment; filename="a.pdf"');
  });
});
