import { describe, expect, it } from "vitest";
import { resultsExportActions } from "@/lib/resultsExports";

// The owner's review of 2026-11-21 (package OR-E): the export menu holds two files for now,
// the CVA sheet PDF and the CSV without names (the third, a PDF of the results page, comes later).
describe("resultsExportActions", () => {
  it("everyone gets the CVA sheet PDF and nothing else", () => {
    expect(resultsExportActions({ isOwner: false, isAdminViewer: false })).toEqual(["cvaPdf"]);
  });
  it("the owner and the admin lens also get the CSV without names", () => {
    expect(resultsExportActions({ isOwner: true, isAdminViewer: false })).toEqual(["cvaPdf", "csvNoNames"]);
    expect(resultsExportActions({ isOwner: false, isAdminViewer: true })).toEqual(["cvaPdf", "csvNoNames"]);
  });
});
