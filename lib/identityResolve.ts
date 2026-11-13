"use client";

// Browser-side identity checks (S10 WP8, fourth review). One place decides what
// a tab does when it finds out who holds this device's cookie. The pure tables
// live in lib/expectedUser.ts (classifyBrowserSession, actionOnResume,
// actionOnMarkerRecheck) and lib/offline/claimMarker.ts (claimedRenderedUser).
//
// "Who holds the cookie" is read with `auth.getSession()` (a local read, no
// /auth/v1/user request per resume). The server stays the authority for every
// write; this only decides what to SHOW and when to stop sending.
//
// A guest who finished "Guardar mis resultados" in another tab is the SAME
// person: the cookie now holds the account that absorbed the anonymous user. If
// the claim completion marker says exactly that, the tab does not show the
// "device changed user" notice. It waits for its pending draft writes, moves
// every blob still stored under the anonymous id to the account
// (`rekeyUserBlobs`, idempotent) and reloads, so it re-renders for the account
// and its drafts sync normally.

import { createClient } from "@/lib/supabase/client";
import {
  actionOnMarkerRecheck,
  actionOnResume,
  classifyBrowserSession,
  type BrowserIdentity,
  type IdentityAction,
} from "@/lib/expectedUser";
import { clearIdentityChanged, markIdentityChanged, runBeforeIdentityReload } from "@/lib/identityChange";
import { CLAIM_ANON_KEY, CLAIM_DONE_KEY, claimedRenderedUser } from "@/lib/offline/claimMarker";
import { rekeyUserBlobs } from "@/lib/offline/store";

type Read = { identity: BrowserIdentity; currentUserId: string | null };

async function readIdentity(renderedUserId: string): Promise<Read> {
  try {
    const { data, error } = await createClient().auth.getSession();
    const session = data?.session ?? null;
    return {
      identity: classifyBrowserSession({ session, error }, renderedUserId),
      currentUserId: session?.user?.id ?? null,
    };
  } catch {
    return { identity: "unknown", currentUserId: null };
  }
}

/** True (and the page is reloading) when the claim markers say the rendered
 *  guest was claimed by `currentUserId`. */
async function reloadIfClaimed(renderedUserId: string, currentUserId: string | null): Promise<boolean> {
  if (!currentUserId) return false;
  let startedRaw: string | null = null;
  let doneRaw: string | null = null;
  try {
    startedRaw = window.localStorage.getItem(CLAIM_ANON_KEY);
    doneRaw = window.localStorage.getItem(CLAIM_DONE_KEY);
  } catch {
    return false;
  }
  if (!claimedRenderedUser({ renderedUserId, currentUserId, startedRaw, doneRaw, now: Date.now() })) return false;
  // 1. let the cup page write what is being typed (under the anonymous id),
  // 2. move every blob under the anonymous id to the account,
  // 3. reload so the page renders for the account.
  await runBeforeIdentityReload();
  await rekeyUserBlobs(renderedUserId, currentUserId);
  window.location.reload();
  return true;
}

function apply(action: IdentityAction): void {
  if (action === "latch") markIdentityChanged();
  else if (action === "clear") clearIdentityChanged();
}

/** On mount and on foreground resume. different -> (claim: reload) else latch;
 *  same -> clear the latch; none/unknown -> nothing. */
export async function checkIdentityOnResume(renderedUserId: string): Promise<void> {
  const { identity, currentUserId } = await readIdentity(renderedUserId);
  if (identity === "different" && (await reloadIfClaimed(renderedUserId, currentUserId))) return;
  apply(actionOnResume(identity));
}

/** A storage marker named this tab's user (or nobody in particular). different
 *  (claim: reload) or none -> latch; same/unknown -> nothing. */
export async function checkIdentityOnMarker(renderedUserId: string): Promise<void> {
  const { identity, currentUserId } = await readIdentity(renderedUserId);
  if (identity === "different" && (await reloadIfClaimed(renderedUserId, currentUserId))) return;
  apply(actionOnMarkerRecheck(identity));
}

/** The server said `identity_changed` (a positive mismatch). Unless the claim
 *  markers explain it (reload), latch; the server is the authority, so a local
 *  read that disagrees does not undo it (the next resume re-checks). */
export async function onServerIdentityChanged(renderedUserId: string): Promise<void> {
  const { identity, currentUserId } = await readIdentity(renderedUserId);
  if (identity === "different" && (await reloadIfClaimed(renderedUserId, currentUserId))) return;
  markIdentityChanged();
}

/** The shell was re-rendered for another user than the one this tab started
 *  with (a server refresh). Same claim exception, otherwise latch. */
export async function onRenderedUserChanged(renderedUserId: string, nowUserId: string): Promise<void> {
  if (await reloadIfClaimed(renderedUserId, nowUserId)) return;
  markIdentityChanged();
}
