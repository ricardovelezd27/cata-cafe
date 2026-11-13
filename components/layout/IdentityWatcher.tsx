"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  IDENTITY_EPOCH_KEY,
  classifyIdentityLookup,
  decideForMarker,
  parseIdentityMarker,
  shouldStopForLookup,
} from "@/lib/expectedUser";
import { isIdentityChanged, markIdentityChanged, onIdentityChanged } from "@/lib/identityChange";
import { useForegroundResume } from "@/hooks/useForegroundResume";

export type IdentityWatcherTranslations = {
  /** errors.codes.identity_changed */
  notice: string;
  /** offline.reloadNow */
  reload: string;
};

/**
 * Mounted once in the app shell (S10 WP8, third review H1b). On a shared
 * device another tab can sign this tab's person out and let someone else in
 * (the join screen's "No soy", sign-out, switch account). This tab keeps
 * showing the first person's form, so it must notice and stop writing:
 *
 *  - the `storage` event (fires only in OTHER tabs) carries a marker naming the
 *    user that left (`lib/expectedUser.ts` decideForMarker);
 *  - on foreground resume (and bfcache restore) it asks the browser client who
 *    is signed in and compares with the id this tab was FIRST rendered for;
 *  - a server refresh that re-renders the shell for another user is caught by
 *    comparing the `userId` prop with the first one.
 *
 * Any of them latches `markIdentityChanged()` (lib/identityChange.ts): the cup
 * page's saves and the offline replay stop, and this bar asks for a reload. It
 * never reloads by itself: unsynced drafts stay on the device under the id that
 * wrote them and nothing is deleted. Non-blocking.
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

  useEffect(() => {
    if (userId !== renderedId) markIdentityChanged();
  }, [userId, renderedId]);

  const recheck = useCallback(async () => {
    try {
      const { data, error } = await createClient().auth.getUser();
      const lookup = classifyIdentityLookup({ user: data.user, error }, (u) => u.id === renderedId);
      if (shouldStopForLookup(lookup)) markIdentityChanged();
    } catch {
      // unreachable: change nothing, the next resume asks again
    }
  }, [renderedId]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== IDENTITY_EPOCH_KEY) return;
      const decision = decideForMarker(renderedId, parseIdentityMarker(e.newValue));
      if (decision === "stop") markIdentityChanged();
      else if (decision === "recheck") void recheck();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [renderedId, recheck]);

  useForegroundResume(() => void recheck(), { pageshow: true });

  if (!changed) return null;
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
        onClick={() => window.location.reload()}
        className="min-h-[44px] shrink-0 rounded-sm px-2 font-semibold underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {t.reload}
      </button>
    </div>
  );
}
