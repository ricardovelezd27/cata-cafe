import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cupGroupProgressForViewer } from "@/lib/cupGroupProgress";

// S10 WP4a review H1 (Kim C5): the /cup payload of a participant must carry no
// "who has submitted" information, neither the number nor the formatted line.
const format = (done: number, total: number) => `${done} de ${total} enviados`;

describe("cupGroupProgressForViewer", () => {
  it("gives the owner the count and the formatted line", () => {
    expect(cupGroupProgressForViewer({ viewerId: "o", ownerId: "o", done: 3, total: 5, format })).toEqual({
      submittedCount: 3,
      submittedOf: "3 de 5 enviados",
    });
  });

  it("gives a participant nothing, whatever the real numbers are", () => {
    for (const [done, total] of [
      [0, 5],
      [3, 5],
      [5, 5],
    ]) {
      expect(cupGroupProgressForViewer({ viewerId: "p", ownerId: "o", done, total, format })).toEqual({
        submittedCount: 0,
        submittedOf: "",
      });
    }
  });

  it("decides ownership by comparing the two ids: only viewerId === ownerId gets the count", () => {
    expect(cupGroupProgressForViewer({ viewerId: "a", ownerId: "b", done: 1, total: 2, format }).submittedCount).toBe(0);
    expect(cupGroupProgressForViewer({ viewerId: "b", ownerId: "b", done: 1, total: 2, format }).submittedCount).toBe(1);
  });

  it("never calls the formatter for a participant", () => {
    let called = false;
    cupGroupProgressForViewer({
      viewerId: "p",
      ownerId: "o",
      done: 2,
      total: 4,
      format: () => {
        called = true;
        return "x";
      },
    });
    expect(called).toBe(false);
  });
});

// Source-level pin (no render seam exists for the 2 000-line client): the page
// must build the payload fields through the pure function and CupClient must
// gate the line on isOwner.
describe("cup page / CupClient wiring", () => {
  const page = readFileSync("app/[locale]/app/sessions/[id]/cup/page.tsx", "utf8");
  const client = readFileSync("app/[locale]/app/sessions/[id]/cup/CupClient.tsx", "utf8");

  it("the page takes both fields from cupGroupProgressForViewer", () => {
    expect(page).toContain("submittedCount={groupProgress.submittedCount}");
    expect(page).toContain("submittedOf: groupProgress.submittedOf");
    expect(page).not.toMatch(/tg\("submittedOf"[^)]*submittedProgress/);
  });

  it("the page passes the two real ids, never a literal or a derived boolean (second review L6a)", () => {
    const call = page.slice(page.indexOf("cupGroupProgressForViewer({"));
    const args = call.slice(0, call.indexOf("});"));
    // The WHOLE argument, not a prefix: `viewerId: user.id && session.createdBy` (a boolean
    // smuggled in as the id) must fail (third review L4).
    expect(args).toMatch(/^\s*viewerId: user\.id,\s*$/m);
    expect(args).toMatch(/^\s*ownerId: session\.createdBy,\s*$/m);
    expect(args).not.toMatch(/isOwner/);
  });

  it("the whole-argument match rejects the boolean-id mutation (sanity)", () => {
    const WHOLE = /^\s*viewerId: user\.id,\s*$/m;
    expect(WHOLE.test("    viewerId: user.id,\n    ownerId: session.createdBy,")).toBe(true);
    expect(WHOLE.test("    viewerId: user.id && session.createdBy,\n")).toBe(false);
    expect(WHOLE.test("    viewerId: user.id === session.createdBy,\n")).toBe(false);
    expect(WHOLE.test("    viewerId: user.id ?? \"\",\n")).toBe(false);
  });

  it("CupClient renders the submitted line only for the owner", () => {
    const uses = client.match(/\{isGroup && isOwner && \(\s*<div[^>]*>\s*(\{ownerSubmittedText\})/g) ?? [];
    expect(uses.length).toBe(2);
    expect(client).toMatch(/const ownerSubmittedText = !isOwner\s*\?\s*""/);
  });
});
