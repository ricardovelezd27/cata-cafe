// The export actions of the results page, per viewer. ONE pure function decides
// which ones a viewer gets; the "Exportar" sheet renders exactly this list.
// Three files (the owner's review of 2026-11-21, package OR-E):
// - The official CVA sheet PDF: everyone.
// - A PDF of the results page, with its look: everyone who may read the results
//   (the route answers 409 while a group session's results are hidden).
// - The CSV without names: the session owner or the admin lens (the route 404s
//   for anyone else).

export type ResultsExportId = "cvaPdf" | "resultsPdf" | "csvNoNames";

export type ResultsExportViewer = {
  isOwner: boolean;
  isAdminViewer: boolean;
  /** The page's own gate: not a group session, or `canViewGroup`. */
  resultsReadable: boolean;
};

export function resultsExportActions(v: ResultsExportViewer): ResultsExportId[] {
  const out: ResultsExportId[] = ["cvaPdf"];
  if (v.resultsReadable) out.push("resultsPdf");
  if (v.isOwner || v.isAdminViewer) out.push("csvNoNames");
  return out;
}
