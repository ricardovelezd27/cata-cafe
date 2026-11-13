// Client-only side of the "this device changed person" guard (S10 WP8, third
// review H1). Two small pieces over the pure rules in lib/expectedUser.ts:
//
//  1. A module-level latch (same pattern as lib/staleBundle.ts): once a tab
//     learns that the signed-in identity is no longer the one it was rendered
//     for, it stops writing and shows a persistent "reload" notice. Drafts stay
//     on the device, keyed by the user that wrote them; nothing is deleted.
//  2. The cross-tab marker: the tab that CHANGES the identity ("No soy" on the
//     join screen, sign-out, switch account) writes `cata_identity_epoch` to
//     localStorage. The `storage` event fires only in OTHER tabs, which is
//     exactly the audience.

import { IDENTITY_EPOCH_KEY, serializeIdentityMarker } from "@/lib/expectedUser";

let changed = false;
const listeners = new Set<() => void>();

/** This tab's rendered user is no longer the signed-in one (idempotent). */
export function markIdentityChanged(): void {
  if (changed) return;
  changed = true;
  listeners.forEach((l) => l());
}

export function isIdentityChanged(): boolean {
  return changed;
}

/** `useSyncExternalStore`-friendly subscription. */
export function onIdentityChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper. */
export function resetIdentityChangedForTests(): void {
  changed = false;
  listeners.clear();
}

/**
 * Tell the OTHER tabs of this browser that the identity `leftUserId` is gone
 * from this device. Pass "" when the leaving user is not known to the caller
 * (the receivers then ask the server who is signed in). Best effort: storage
 * can be blocked, and the foreground re-check is the second line.
 */
export function announceIdentityLeft(leftUserId: string): void {
  try {
    window.localStorage.setItem(IDENTITY_EPOCH_KEY, serializeIdentityMarker(leftUserId, Date.now()));
  } catch {
    // best effort
  }
}
