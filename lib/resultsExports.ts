// S1 (F-01): the export and document actions of the results page, per viewer.
// ONE pure function decides which ones a viewer gets; the "Exportar" sheet
// renders exactly this list (nothing else on the page renders an export).
// The rules are copied unchanged from the docked footer they replace:
// - "Ver formulario" (print page) and the CVA form PDF: everyone.
// - The participant summary PDF: solo sessions, or group sessions once the
//   group results are visible to this viewer, and only with at least one sent
//   evaluation (the route answers 409 while group results are hidden).
// - The ficha técnica, the results CSV and its variant without names: the
//   session owner or the admin lens (the routes 404 for anyone else).

export type ResultsExportId = "viewForm" | "cvaPdf" | "summary" | "ficha" | "csv" | "csvNoNames";

export type ResultsExportViewer = {
  isGroup: boolean;
  canViewGroup: boolean;
  isOwner: boolean;
  isAdminViewer: boolean;
  /** The viewer has at least one SENT evaluation in this session. */
  hasSubmitted: boolean;
};

export function resultsExportActions(v: ResultsExportViewer): ResultsExportId[] {
  const out: ResultsExportId[] = ["viewForm", "cvaPdf"];
  if ((!v.isGroup || v.canViewGroup) && v.hasSubmitted) out.push("summary");
  if (v.isOwner || v.isAdminViewer) out.push("ficha", "csv", "csvNoNames");
  return out;
}
