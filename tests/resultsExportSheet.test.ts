// S1 (F-01): every export of the results page lives in the one "Exportar" sheet,
// the page has no scroller of its own (the app shell's <main> is the one), and
// only the tabs are docked. Pinned by reading the source, since the layout
// itself needs a browser (measured in the S1 pull request).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ResultsExportId } from "@/lib/resultsExports";

const root = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const client = read("app/[locale]/app/sessions/[id]/results/ResultsClient.tsx");
const sheet = read("components/results/ResultsExportSheet.tsx");

describe("results page: exports only in the sheet", () => {
  it("ResultsClient renders no export link or button itself", () => {
    for (const needle of ["ReportLink", "ButtonLink", "/cva-pdf", "/participant-summary", "/ficha-tecnica", "/results-csv", "/print`"]) {
      expect(client, needle).not.toContain(needle);
    }
    expect(client).toContain("<ResultsExportSheet");
    expect(client).toContain("resultsExportActions(");
  });

  it("the sheet renders every export action", () => {
    const ids: ResultsExportId[] = ["viewForm", "cvaPdf", "summary", "ficha", "csv", "csvNoNames"];
    for (const id of ids) expect(sheet).toContain(`case "${id}":`);
    expect(sheet).toContain("ResponsiveDialog");
  });
});

describe("results page: one scroll container, only the tabs docked", () => {
  it("no absolutely positioned full-screen box and no inner scroller", () => {
    expect(client).not.toContain("absolute inset-0");
    expect(client).not.toContain("flex-1 min-h-0 overflow-y-auto");
    expect(client).not.toMatch(/docked footer/i);
  });

  it("the tabs are the sticky part", () => {
    expect(client).toMatch(/data-results-tabs className="sticky -top-4 lg:-top-6/);
  });
});
