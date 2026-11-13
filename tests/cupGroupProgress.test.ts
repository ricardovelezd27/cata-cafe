import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cupGroupProgressForViewer } from "@/lib/cupGroupProgress";

// S10 WP4a review H1 (Kim C5): the /cup payload of a participant must carry no
// "who has submitted" information, neither the number nor the formatted line.
const format = (done: number, total: number) => `${done} de ${total} enviados`;

describe("cupGroupProgressForViewer", () => {
  it("gives the owner the count and the formatted line", () => {
    expect(cupGroupProgressForViewer({ isOwner: true, done: 3, total: 5, format })).toEqual({
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
      expect(cupGroupProgressForViewer({ isOwner: false, done, total, format })).toEqual({
        submittedCount: 0,
        submittedOf: "",
      });
    }
  });

  it("never calls the formatter for a participant", () => {
    let called = false;
    cupGroupProgressForViewer({
      isOwner: false,
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

  it("CupClient renders the submitted line only for the owner", () => {
    const uses = client.match(/\{isGroup && isOwner && \(\s*<div[^>]*>\s*(\{ownerSubmittedText\})/g) ?? [];
    expect(uses.length).toBe(2);
    expect(client).toMatch(/const ownerSubmittedText = !isOwner\s*\?\s*""/);
  });
});
