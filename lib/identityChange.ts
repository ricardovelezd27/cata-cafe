// Client-only side of the "this device changed person" guard (S10 WP8, third
// and fourth review). Small pieces over the pure rules in lib/expectedUser.ts:
//
//  1. A module-level latch (same pattern as lib/staleBundle.ts). It is set ONLY
//     by a positive finding: the server answered `identity_changed` (a user is
//     signed in and it is a different one), the browser read found a different
//     user, or a marker named this tab's user and nobody holds the cookie any
//     more. While latched, the cup page stops sending live writes (the draft
//     stays on the device) and a notice asks for a reload. It lasts until a
//     reload OR until a later check sees the SAME user signed in again
//     (`clearIdentityChanged`); client navigation does not reset it. The offline
//     replay does not read it: the server-side `blob.userId` check protects it.
//  2. The notice slot: the cup page's OfflineBanner shows the notice (the cup
//     shell is `fixed inset-0 z-40` and covers the layout's bar); the layout's
//     IdentityWatcher shows it on every other page. A page that mounts the
//     banner registers as a host so the two never show at once.
//  3. "Before reload" hooks: the cup page registers one that awaits its pending
//     draft writes, so a claim-driven reload (lib/identityResolve.ts) never
//     loses what is being typed.
//  4. The cross-tab marker: the tab that CHANGES the identity ("No soy" on the
//     join screen, sign-out, switch account) writes `cata_identity_epoch` to
//     localStorage. The `storage` event fires only in OTHER tabs.

import { IDENTITY_EPOCH_KEY, serializeIdentityMarker } from "@/lib/expectedUser";

let changed = false;
let hosts = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** This tab's rendered user is no longer the signed-in one (idempotent). */
export function markIdentityChanged(): void {
  if (changed) return;
  changed = true;
  notify();
}

/** The SAME user is signed in again: saving resumes (idempotent). */
export function clearIdentityChanged(): void {
  if (!changed) return;
  changed = false;
  notify();
}

export function isIdentityChanged(): boolean {
  return changed;
}

/** `useSyncExternalStore`-friendly subscription (latch and host changes). */
export function onIdentityChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A component that renders the identity notice itself (OfflineBanner) calls
 *  this on mount; returns the unregister function. */
export function registerIdentityNoticeHost(): () => void {
  hosts += 1;
  notify();
  return () => {
    hosts = Math.max(0, hosts - 1);
    notify();
  };
}

export function hasIdentityNoticeHost(): boolean {
  return hosts > 0;
}

const beforeReload = new Set<() => Promise<void>>();

/** Registers work to finish before a claim-driven reload; returns unregister. */
export function registerBeforeIdentityReload(fn: () => Promise<void>): () => void {
  beforeReload.add(fn);
  return () => {
    beforeReload.delete(fn);
  };
}

/** Runs every registered hook, waiting at most `capMs` in total. Never throws. */
export async function runBeforeIdentityReload(capMs = 2000): Promise<void> {
  const all = Promise.allSettled([...beforeReload].map((fn) => fn()));
  await Promise.race([all, new Promise<void>((r) => setTimeout(r, capMs))]);
}

/** Test helper. */
export function resetIdentityChangedForTests(): void {
  changed = false;
  hosts = 0;
  beforeReload.clear();
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
