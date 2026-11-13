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
  type IdentityMarkerKind,
} from "@/lib/expectedUser";
import { clearIdentityChanged, markIdentityChanged, runBeforeIdentityReload } from "@/lib/identityChange";
import { claimedRenderedUser } from "@/lib/offline/claimMarker";
import { readClaimMarkers } from "@/lib/offline/claimRekey";
import { rekeyUserBlobs } from "@/lib/offline/store";
import { sequenceIdentityReload } from "@/lib/identitySequence";

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

/** Do the claim markers say the guest this tab was rendered for was claimed by
 *  `currentUserId`? (Pure rule: claimedRenderedUser.) */
function claimedByMarkers(renderedUserId: string, currentUserId: string | null): boolean {
  if (!currentUserId) return false;
  const markers = readClaimMarkers();
  if (!markers) return false;
  return claimedRenderedUser({ renderedUserId, currentUserId, ...markers, now: Date.now() });
}

/**
 * The ONE reload every identity notice uses (S10 WP8b): the banner's button on
 * the cup page, the layout bar's button and the claim-driven automatic reload.
 *  1. let the cup page write what is being typed (before-reload hooks, capped),
 *  2. if the claim markers say this tab's guest was claimed by the account that
 *     is signed in now, move every blob under the anonymous id to the account
 *     (rekeyUserBlobs: idempotent, the newer edit per module wins),
 *  3. reload. The reloaded cup page also awaits the same re-key before it
 *     hydrates (lib/offline/claimRekey.ts), so a claim that finished while this
 *     tab was latched is still picked up.
 * Never throws; a failure to read the cookie just reloads.
 */
export async function reloadIdentity(renderedUserId: string): Promise<void> {
  // The order (hooks, then re-key, then reload) is pinned by
  // lib/identitySequence.ts + tests/identitySequence.test.ts.
  await sequenceIdentityReload({
    beforeReload: runBeforeIdentityReload,
    rekeyIfClaimed: async () => {
      const { currentUserId } = await readIdentity(renderedUserId);
      if (currentUserId && claimedByMarkers(renderedUserId, currentUserId)) {
        await rekeyUserBlobs(renderedUserId, currentUserId);
      }
    },
    reload: () => window.location.reload(),
  });
}

/** True (and the page is reloading) when the claim markers say the rendered
 *  guest was claimed by `currentUserId`. */
async function reloadIfClaimed(renderedUserId: string, currentUserId: string | null): Promise<boolean> {
  if (!claimedByMarkers(renderedUserId, currentUserId)) return false;
  await reloadIdentity(renderedUserId);
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
export async function checkIdentityOnMarker(renderedUserId: string, kind: IdentityMarkerKind = "left"): Promise<void> {
  const { identity, currentUserId } = await readIdentity(renderedUserId);
  if (identity === "different" && (await reloadIfClaimed(renderedUserId, currentUserId))) return;
  apply(actionOnMarkerRecheck(identity, kind));
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
