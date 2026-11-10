"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ConfirmDialog } from "@/components/ui";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { OFFLINE_SYNC_EVENT } from "@/hooks/useOfflineSync";
import { countDeviceOnly, rekeyUserBlobs } from "@/lib/offline/store";
import { CLAIM_ANON_KEY } from "@/lib/offline/claimMarker";
import { purgeCachesOnUserChange } from "@/lib/offline/deviceState";

export type UnsyncedGuardTranslations = {
  signOutTitle: string;
  /** RAW template with "{count}". */
  signOutBody: string;
  signOutCancel: string;
  signOutLeave: string;
  claimTitle: string;
  /** RAW template with "{count}". */
  claimBody: string;
  claimCancel: string;
  claimLeave: string;
  close: string;
};

export type GuardKind = "signOut" | "claim";

type GuardContextValue = {
  userId: string;
  /** Resolves true when it is fine to leave (nothing device-only, it synced
   *  during the check, or the cupper chose to continue); false on cancel. */
  confirmLeave: (kind: GuardKind) => Promise<boolean>;
};

const GuardContext = createContext<GuardContextValue | null>(null);

/** Null outside the app shell (landing, login): callers then skip the guard. */
export function useUnsyncedGuard(): GuardContextValue | null {
  return useContext(GuardContext);
}

// One dialog for the two ways a cupper can walk away from unsynced work
// (S8-09, F-offline-5, F-guest-5): signing out, and starting the guest claim
// (which deletes the anonymous account the drafts are keyed to). Drafts stay on
// disk after a sign-out, exactly as before; the guard only makes the cost
// visible. Also finishes a guest claim: after the sign-in round trip the
// signed-in id differs from the anonymous one stored by useGuestClaim, so the
// blobs are re-keyed here and replay under the new account.
export function UnsyncedGuardProvider({
  userId,
  isGuest,
  translations: t,
  children,
}: {
  userId: string;
  isGuest: boolean;
  translations: UnsyncedGuardTranslations;
  children: ReactNode;
}) {
  const { online } = useConnectivity();
  const { retrySync } = useOfflineSync({ userId, online });
  const retryRef = useRef(retrySync);
  const onlineRef = useRef(online);
  useEffect(() => {
    retryRef.current = retrySync;
    onlineRef.current = online;
  }, [retrySync, online]);

  const [dialog, setDialog] = useState<{ kind: GuardKind; count: number } | null>(null);
  const resolverRef = useRef<((go: boolean) => void) | null>(null);

  // Shared tablet: a different user than the one this device last served means
  // the old cached pages must go before they can be shown offline (F-offline-9).
  useEffect(() => {
    void purgeCachesOnUserChange(userId);
  }, [userId]);

  // Guest claim finished: move the anonymous id's drafts to the new account.
  useEffect(() => {
    if (isGuest) return;
    let anonId: string | null = null;
    try {
      anonId = window.localStorage.getItem(CLAIM_ANON_KEY);
    } catch {
      return;
    }
    if (!anonId || anonId === userId) return;
    void (async () => {
      await rekeyUserBlobs(anonId, userId);
      try {
        window.localStorage.removeItem(CLAIM_ANON_KEY);
      } catch {
        // best effort
      }
      window.dispatchEvent(new Event(OFFLINE_SYNC_EVENT));
      void retryRef.current();
    })();
  }, [isGuest, userId]);

  const confirmLeave = useCallback(
    async (kind: GuardKind): Promise<boolean> => {
      let count = await countDeviceOnly(userId);
      if (count === 0) return true;
      // Online: try to push the queue first; only warn about what is left.
      if (onlineRef.current) {
        await retryRef.current();
        count = await countDeviceOnly(userId);
        if (count === 0) return true;
      }
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setDialog({ kind, count });
      });
    },
    [userId],
  );

  const settle = (go: boolean) => {
    resolverRef.current?.(go);
    resolverRef.current = null;
    setDialog(null);
  };

  const value = useMemo(() => ({ userId, confirmLeave }), [userId, confirmLeave]);
  const isClaim = dialog?.kind === "claim";

  return (
    <GuardContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={dialog !== null}
        onOpenChange={(o) => {
          if (!o) settle(false);
        }}
        title={isClaim ? t.claimTitle : t.signOutTitle}
        body={(isClaim ? t.claimBody : t.signOutBody).replace(
          "{count}",
          String(dialog?.count ?? 0),
        )}
        confirmLabel={isClaim ? t.claimLeave : t.signOutLeave}
        cancelLabel={isClaim ? t.claimCancel : t.signOutCancel}
        closeLabel={t.close}
        onConfirm={() => settle(true)}
      />
    </GuardContext.Provider>
  );
}
