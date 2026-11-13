// Where the "new version, reload" notice renders (S10 WP9b review fix).
//
// The cup page mounts a SessionShell (position: fixed; inset: 0; z-index: 40)
// that covers the app shell's normal-flow notice, so on the cup route the
// notice is rendered by CupClient inside the shell and the app-layout copy
// stays hidden. Exactly one copy is visible on every route. The waiting room
// and the results page do not use SessionShell, so they keep the app-layout copy.
//
// Pure: no imports, unit-tested in tests/staleNoticePlacement.test.ts.

export type StaleNoticeSlot = "app" | "cup";

/** True for /{locale}/app/sessions/{id}/cup (and sub-paths), the SessionShell route. */
export function isCupShellPath(pathname: string | null | undefined): boolean {
  if (typeof pathname !== "string") return false;
  return /^(\/[a-z]{2})?\/app\/sessions\/[^/]+\/cup(\/|$)/.test(pathname);
}

/** Whether the copy mounted in `slot` should render on `pathname`. */
export function staleNoticeRendersIn(slot: StaleNoticeSlot, pathname: string | null | undefined): boolean {
  return slot === "cup" ? true : !isCupShellPath(pathname);
}
