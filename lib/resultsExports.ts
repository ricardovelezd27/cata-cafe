// The export actions of the results page, per viewer. ONE pure function decides
// which ones a viewer gets; the "Exportar" sheet renders exactly this list.
// Two files only (the owner's review of 2026-11-21, package OR-E):
// - The official CVA sheet PDF: everyone.
// - The CSV without names: the session owner or the admin lens (the route 404s
//   for anyone else).

export type ResultsExportId = "cvaPdf" | "csvNoNames";

export type ResultsExportViewer = {
  isOwner: boolean;
  isAdminViewer: boolean;
};

export function resultsExportActions(v: ResultsExportViewer): ResultsExportId[] {
  const out: ResultsExportId[] = ["cvaPdf"];
  if (v.isOwner || v.isAdminViewer) out.push("csvNoNames");
  return out;
}
