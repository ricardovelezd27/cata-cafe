import { describe, expect, it } from "vitest";
import { resultsExportActions, type ResultsExportViewer } from "@/lib/resultsExports";

const base: ResultsExportViewer = { isGroup: true, canViewGroup: false, isOwner: false, isAdminViewer: false, hasSubmitted: false };

describe("resultsExportActions (same rules as the footer it replaces)", () => {
  it("a participant of an open group session: the form and the CVA PDF", () => {
    expect(resultsExportActions({ ...base, hasSubmitted: true })).toEqual(["viewForm", "cvaPdf"]);
  });
  it("a participant of a closed group session with a sent evaluation: plus the summary", () => {
    expect(resultsExportActions({ ...base, canViewGroup: true, hasSubmitted: true })).toEqual(["viewForm", "cvaPdf", "summary"]);
  });
  it("no sent evaluation: no summary", () => {
    expect(resultsExportActions({ ...base, canViewGroup: true })).toEqual(["viewForm", "cvaPdf"]);
  });
  it("the owner (and the admin lens): ficha técnica and both CSVs", () => {
    const all = ["viewForm", "cvaPdf", "summary", "ficha", "csv", "csvNoNames"];
    expect(resultsExportActions({ ...base, isOwner: true, canViewGroup: true, hasSubmitted: true })).toEqual(all);
    expect(resultsExportActions({ ...base, isAdminViewer: true, canViewGroup: true, hasSubmitted: true })).toEqual(all);
  });
  it("a solo session shows the summary without group visibility", () => {
    expect(resultsExportActions({ ...base, isGroup: false, isOwner: true, hasSubmitted: true })).toContain("summary");
  });
  it("every viewer has at least one export, so the Exportar button always shows", () => {
    expect(resultsExportActions(base).length).toBeGreaterThan(0);
  });
});
