// Stale client bundle after a deploy (S9-01, audit C-06).
//
// Next 16 recomputes server-action ids per build. A tab left open across a
// deploy calls an id the new server no longer has; the client router throws
// `UnrecognizedActionError` (node_modules/next/dist/client/components/
// unrecognized-action-error.js; thrown from server-action-reducer.js with the
// message `Server Action "<id>" was not found on the server.`). Every save
// then fails the same way until a reload, so the cupper must be told to reload.
// Drafts stay on the device and stay `pending`; this only drives a notice.
//
// Pure + a tiny module-level flag (client only; on the server it is simply
// never set). `instanceof` is avoided on purpose: the class may come from
// another chunk, so the name and the message are checked instead.

export function isStaleBundleError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; message?: unknown };
  if (e.name === "UnrecognizedActionError") return true;
  return (
    typeof e.message === "string" &&
    /Server Action ".*" was not found on the server/.test(e.message)
  );
}

let stale = false;
const listeners = new Set<() => void>();

/** Remember that this tab runs an outdated bundle (idempotent). */
export function markStaleBundle(): void {
  if (stale) return;
  stale = true;
  listeners.forEach((l) => l());
}

export function isStaleBundle(): boolean {
  return stale;
}

/** `useSyncExternalStore`-friendly subscription. */
export function onStaleBundle(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper: clear the flag and listeners. */
export function resetStaleBundleForTests(): void {
  stale = false;
  listeners.clear();
}

/** Mark the flag when `err` is the stale-bundle error. Returns whether it was. */
export function noteIfStaleBundle(err: unknown): boolean {
  if (!isStaleBundleError(err)) return false;
  markStaleBundle();
  return true;
}
