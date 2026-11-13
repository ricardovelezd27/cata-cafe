// Client-only glue between the guest-claim markers (lib/offline/claimMarker.ts,
// pure) and the draft store (lib/offline/store.ts). S10 WP8b.
//
// The re-key moves every draft blob stored under the anonymous id to the account
// that claimed it. It is idempotent and the newer edit per module wins
// (rekeyBlob), so it can run from several places:
//   - UnsyncedGuardProvider on every app mount,
//   - reloadIdentity (lib/identityResolve.ts) right before a reload,
//   - the cup page BEFORE it hydrates its form (awaitClaimRekey): effects run
//     child first, so without this the form read the account's blob before the
//     provider had moved the latched edits into it.

import { CLAIM_ANON_KEY, CLAIM_DONE_KEY, decideClaimRekey } from "@/lib/offline/claimMarker";
import { rekeyUserBlobs } from "@/lib/offline/store";

export function readClaimMarkers(): { startedRaw: string | null; doneRaw: string | null } | null {
  try {
    return {
      startedRaw: window.localStorage.getItem(CLAIM_ANON_KEY),
      doneRaw: window.localStorage.getItem(CLAIM_DONE_KEY),
    };
  } catch {
    return null;
  }
}

/**
 * If the markers say a guest was claimed by `userId`, move that guest's drafts
 * to `userId` and resolve how many blobs moved (0 otherwise). Never throws,
 * never deletes anything but the moved-from key after the copy landed.
 */
export async function awaitClaimRekey(userId: string): Promise<number> {
  const markers = readClaimMarkers();
  if (!markers) return 0;
  const decision = decideClaimRekey({ ...markers, userId, now: Date.now() });
  if (!decision.rekeyFrom) return 0;
  try {
    return await rekeyUserBlobs(decision.rekeyFrom, userId);
  } catch {
    return 0;
  }
}
