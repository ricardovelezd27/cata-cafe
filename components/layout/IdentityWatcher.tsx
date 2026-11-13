"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { IDENTITY_EPOCH_KEY, decideForMarker, parseIdentityMarker } from "@/lib/expectedUser";
import { announceSignedInIfStarted, hasIdentityNoticeHost, isIdentityChanged, onIdentityChanged } from "@/lib/identityChange";
import { reloadIdentity, checkIdentityOnMarker, checkIdentityOnResume, onRenderedUserChanged } from "@/lib/identityResolve";
import { useForegroundResume } from "@/hooks/useForegroundResume";

export type IdentityWatcherTranslations = {
  /** errors.codes.identity_changed */
  notice: string;
  /** offline.reloadNow */
  reload: string;
};

/**
 * Mounted once in the app shell (S10 WP8, third and fourth review). On a shared
 * device another tab can sign this tab's person out and let someone else in
 * (the join screen's "No soy", sign-out, switch account). This tab keeps
 * showing the first person's form, so it must notice and stop sending.
 *
 * "Changed" means ONE thing: a user is signed in on this device and it is a
 * DIFFERENT user from the one this tab was rendered for. "Nobody signed in" and
 * "could not find out" are not a change. Who holds the cookie is read with
 * `auth.getSession()` (a local read; the server stays the authority for every
 * write). Pure tables: lib/expectedUser.ts; behaviour: lib/identityResolve.ts.
 *
 *  - on mount and on foreground resume (and bfcache restore): different ->
 *    latch, same -> clear the latch, none/unknown -> nothing;
 *  - on a `storage` marker (`cata_identity_epoch`, fires only in OTHER tabs)
 *    that names this tab's user (or nobody in particular): re-read; different
 *    or none -> latch, same/unknown -> nothing. A marker naming someone else is
 *    ignored;
 *  - a server refresh that re-renders the shell for another user is caught by
 *    comparing the `userId` prop with the first one;
 *  - a guest who finished the account claim in another tab is the SAME person:
 *    no notice, the tab re-keys its drafts to the account and reloads.
 *
 * The latch is module-level (lib/identityChange.ts): it lasts until a reload or
 * until a later check sees the same user again, across client navigation. This
 * bar shows it on every page EXCEPT where the page renders the notice itself
 * (the cup page's OfflineBanner, because the cup shell covers this bar). It
 * never reloads by itself, apart from the claim case above; unsynced drafts
 * stay on the device under the id that wrote them and nothing is deleted.
 */
export function IdentityWatcher({
  userId,
  translations: t,
}: {
  userId: string;
  translations: IdentityWatcherTranslations;
}) {
  // The id this tab was rendered for, frozen at mount: a later refresh must not
  // silently adopt the new person's id.
  const [renderedId] = useState(userId);
  const changed = useSyncExternalStore(onIdentityChanged, isIdentityChanged, () => false);
  const hostedElsewhere = useSyncExternalStore(onIdentityChanged, hasIdentityNoticeHost, () => false);

  useEffect(() => {
    if (userId !== renderedId) void onRenderedUserChanged(renderedId, userId);
  }, [userId, renderedId]);

  useEffect(() => {
    void checkIdentityOnResume(renderedId);
    announceSignedInIfStarted(); // WP8b: a Google sign-in just came back
  }, [renderedId]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== IDENTITY_EPOCH_KEY) return;
      const marker = parseIdentityMarker(e.newValue);
      if (decideForMarker(renderedId, marker) === "recheck") {
        void checkIdentityOnMarker(renderedId, marker?.kind ?? "left");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [renderedId]);

  useForegroundResume(() => void checkIdentityOnResume(renderedId), { pageshow: true });

  if (!changed || hostedElsewhere) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 border-b border-secondary/30 bg-secondary-container/30 px-4 py-2 font-sans text-sm text-on-surface"
    >
      <RefreshCw size={15} aria-hidden className="shrink-0" />
      <span className="flex-1 break-words">{t.notice}</span>
      <button
        type="button"
        onClick={() => void reloadIdentity(renderedId)}
        className="min-h-[44px] shrink-0 rounded-sm px-2 font-semibold underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {t.reload}
      </button>
    </div>
  );
}
