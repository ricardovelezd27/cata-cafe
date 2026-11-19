import { describe, expect, it } from "vitest";
import { formatDeadlineInstant } from "@/lib/deadlineFormat";
import { readSource, SCAN_TIMEOUT_MS, walkSource } from "./helpers/sourceTree";

// Production bug 2026-11-20: DeadlineBanner asked Intl for `dateStyle` +
// `timeStyle` with `timeZoneName`, which ECMA-402 refuses with a TypeError.
// The banner renders in the browser for every open session with a closing
// date, so the first such row took the sessions list into the error boundary.

const AT = new Date("2027-04-30T21:59:59.999Z"); // end of 30 April in Europe/Madrid

describe("formatDeadlineInstant", () => {
  it("the old option mix is what throws (the cause, pinned)", () => {
    expect(() =>
      new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Madrid",
        timeZoneName: "short",
      }).format(AT),
    ).toThrow(TypeError);
  });

  it.each(["es-CO", "en-US"])("writes the day, the time and the zone name in %s without throwing", (bcp) => {
    const text = formatDeadlineInstant(AT, bcp, "Europe/Madrid", true);
    expect(text).toContain("2027");
    expect(text).toContain("30");
    expect(text).toMatch(/59/);
    // The zone's short name is there (GMT+2 / CEST, depending on the ICU data).
    expect(text).toMatch(/GMT|CEST|UTC/);
  });

  it("leaves the zone name out on request (the viewer's local line)", () => {
    const withName = formatDeadlineInstant(AT, "en-US", "America/Santiago", true);
    const without = formatDeadlineInstant(AT, "en-US", "America/Santiago", false);
    expect(without.length).toBeGreaterThan(0);
    expect(withName.length).toBeGreaterThan(without.length);
  });

  it("writes the day in the given zone", () => {
    // 21:59 UTC on 30 April is already 1 May in Asia/Tokyo.
    expect(formatDeadlineInstant(AT, "en-US", "Asia/Tokyo", false)).toMatch(/May 1/);
    expect(formatDeadlineInstant(AT, "en-US", "Europe/Madrid", false)).toMatch(/Apr 30/);
  });

  it("never throws: an unknown zone falls back to UTC, an invalid date gives an empty string", () => {
    expect(formatDeadlineInstant(AT, "es-CO", "Not/AZone", true)).toContain("2027");
    expect(formatDeadlineInstant(new Date(Number.NaN), "es-CO", "UTC", true)).toBe("");
  });
});

/** True when an options object (code only, comments removed) sets `timeZoneName`
 *  next to `dateStyle` or `timeStyle`. */
function mixesStyleWithZoneName(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const match of code.matchAll(/\btimeZoneName\s*:/g)) {
    const at = match.index ?? 0;
    const open = code.lastIndexOf("{", at);
    const close = code.indexOf("}", at);
    const literal = code.slice(Math.max(open, 0), close === -1 ? undefined : close);
    if (/\b(dateStyle|timeStyle)\s*:/.test(literal)) return true;
  }
  return false;
}

describe("no Intl options object mixes dateStyle/timeStyle with timeZoneName", () => {
  it("the scan recognises the mix that broke the sessions list", () => {
    const broken = `const t = new Intl.DateTimeFormat(bcp, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ownerZone,
    timeZoneName: "short",
  }).format(at);`;
    expect(mixesStyleWithZoneName(broken)).toBe(true);
    const commentOnly = `// never dateStyle: with timeZoneName: in one object\nconst o = { day: "numeric", timeZoneName: "short" };`;
    expect(mixesStyleWithZoneName(commentOnly)).toBe(false);
  });

  it(
    "scans app, components, hooks and lib",
    () => {
      const offenders: string[] = [];
      for (const dir of ["app", "components", "hooks", "lib"]) {
        const files = walkSource(dir, "deadlineFormat", {
          skip: (name, isDirectory) => isDirectory && (name === "generated" || name === "node_modules"),
          include: /\.(ts|tsx)$/,
        });
        for (const file of files) {
          if (mixesStyleWithZoneName(readSource(file))) offenders.push(file);
        }
      }
      expect(offenders).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
});
