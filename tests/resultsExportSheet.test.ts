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

  it("the sheet renders exactly the three export actions", () => {
    const ids: ResultsExportId[] = ["cvaPdf", "resultsPdf", "csvNoNames"];
    for (const id of ids) expect(sheet).toContain(`case "${id}":`);
    // the removed entries stay removed: the form view, the summary, the technical sheet, the CSV with names
    for (const gone of ["/print", "/participant-summary", "/ficha-tecnica", "viewForm"]) expect(sheet, gone).not.toContain(gone);
    expect(sheet.match(/results-csv/g)).toHaveLength(1);
    expect(sheet.match(/results-pdf/g)).toHaveLength(1);
    expect(sheet).toContain("names=0");
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

describe("results page: the sheet gives focus back through the kit (N3)", () => {
  it("has no focus workaround of its own: ResponsiveDialog returns focus to \"Exportar\"", () => {
    expect(sheet).not.toMatch(/requestAnimationFrame|cancelAnimationFrame/);
    expect(sheet).not.toMatch(/\.focus\(\)/);
    expect(sheet).not.toMatch(/useEffect|useRef/);
    expect(sheet).toContain("<ResponsiveDialog open={open} onOpenChange={setOpen}");
  });
});
