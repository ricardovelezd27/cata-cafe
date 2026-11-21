import { describe, expect, it } from "vitest";
import { resultsExportActions } from "@/lib/resultsExports";

// The owner's review of 2026-11-21 (package OR-E): three files, the CVA sheet PDF, a PDF of the
// results page and the CSV without names.
describe("resultsExportActions", () => {
  it("everyone gets the CVA sheet PDF and the PDF of the results", () => {
    expect(resultsExportActions({ isOwner: false, isAdminViewer: false, resultsReadable: true })).toEqual([
      "cvaPdf",
      "resultsPdf",
    ]);
  });
  it("the PDF of the results waits while a group session's results are hidden", () => {
    expect(resultsExportActions({ isOwner: false, isAdminViewer: false, resultsReadable: false })).toEqual(["cvaPdf"]);
  });
  it("the owner and the admin lens also get the CSV without names, last", () => {
    expect(resultsExportActions({ isOwner: true, isAdminViewer: false, resultsReadable: true })).toEqual([
      "cvaPdf",
      "resultsPdf",
      "csvNoNames",
    ]);
    expect(resultsExportActions({ isOwner: false, isAdminViewer: true, resultsReadable: true })).toEqual([
      "cvaPdf",
      "resultsPdf",
      "csvNoNames",
    ]);
  });
});
