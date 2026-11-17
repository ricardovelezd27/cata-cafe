// The coffee whose sheet is open, written in the results page's address
// (package R3): `?sample=<session sample id>`. Opening a coffee writes it,
// a reload opens it again, "back" closes it. Pure rules; the browser part is
// `useSheetAddress` in the results route.

/** The query parameter that names the open coffee. */
export const SHEET_PARAM = "sample";

/**
 * The query string with the sheet's coffee set, or removed with null. Every
 * other parameter is kept as it is. Returns "" or "?a=b".
 */
export function withSheet(search: string, sampleId: string | null): string {
  const params = new URLSearchParams(search);
  if (sampleId) params.set(SHEET_PARAM, sampleId);
  else params.delete(SHEET_PARAM);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * The coffee the address names, when it is one of THIS session's samples (the
 * list the page already gave this viewer). Anything else (a typo, another
 * session's sample, an empty value) opens nothing.
 */
export function sheetSampleId(value: string | null | undefined, sampleIds: readonly string[]): string | null {
  return typeof value === "string" && value !== "" && sampleIds.includes(value) ? value : null;
}

/**
 * How the sheet leaves the address when it is closed. "back": this visit
 * pushed the entry, so closing is the same step as the browser's Back and the
 * history holds no dead entry. "replace": the page was loaded with the coffee
 * already in the address (a reload, a shared link), so there is no entry of
 * this page to go back to: the parameter is removed in place.
 */
export function closeMove(pushedHere: boolean): "back" | "replace" {
  return pushedHere ? "back" : "replace";
}
