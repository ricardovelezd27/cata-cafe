"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { joinSessionAsGuest } from "@/app/actions/join";
import { createClient } from "@/lib/supabase/client";
import { countWarnable } from "@/lib/offline/store";
import { clearLocalDeviceState } from "@/lib/offline/deviceState";
import { classifyGuestLookup, type GuestLookup } from "@/lib/joinRules";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Button, ConfirmDialog, useActionFeedback } from "@/components/ui";

export type GuestIdentityTranslations = {
  /** Already rendered with the name on the server. */
  title: string;
  lead: string;
  continueLabel: string;
  notMeLabel: string;
  confirmTitle: string;
  confirmBody: string;
  /** RAW template with literal "{name}" and "{count}" (replaced here: the count
   *  only exists on this device). Written to read correctly for any count. */
  unsyncedTemplate: string;
  syncing: string;
  confirmButton: string;
  cancel: string;
  close: string;
  /** Shown on the continue button while the request runs. */
  joining: string;
};

/** The dialog never waits longer than this for the draft sync (M5). */
const SYNC_CAP_MS = 8000;

/** Single-pass template fill: no `$&`-style patterns, and a literal "{count}"
 *  inside a name is never substituted. */
function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(name|count)\}/g, (_m, key: string) => values[key] ?? "");
}

/** Mounted only while the "No soy" dialog is open and the identity is verified:
 *  runs the same replay the sign-out guard runs (useOfflineSync.retrySync) for
 *  THIS guest's own saved drafts, then reports back. The server refuses to
 *  write if the session changed meanwhile (replay `expectedUserId`). */
function PendingNotesSync({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { online } = useConnectivity();
  const { retrySync } = useOfflineSync({ userId, online });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void retrySync().finally(onDone);
  }, [retrySync, onDone]);
  return null;
}

/**
 * "¿Eres <nombre>?" (S10 WP8, F-guest-4). Rendered by the join page for an
 * ANONYMOUS viewer on a link they could use (already a member, or a newcomer),
 * so a second person on a shared tablet is not silently acting as the first.
 * TODO(kim-validar:E1): simulated answer.
 *
 * EVERY action first re-checks the browser's current user against `userId`
 * (the guest this screen was rendered for) with `classifyGuestLookup`:
 *   same -> act; different (another guest, a registered user, or no session at
 *   all) -> `router.refresh()` and do nothing; unreachable (network / 5xx) ->
 *   say so, change nothing.
 *  - "Continuar como X": a member `router.push`es to `continueHref`; a newcomer
 *    joins through `joinSessionAsGuest` (a refusal refreshes into the page's
 *    refusal screen).
 *  - "No soy X": confirm, then `signOut(locale, "local")` FIRST and only after
 *    the server succeeded `clearLocalDeviceState()` (same order as
 *    SignOutButton). Nothing is deleted from the draft store. Then a hard
 *    navigation to this same join URL, which re-runs the normal decision (guest
 *    form, or the refusal screen when the link is closed / expired / full /
 *    entries-locked). Everything stays disabled until the page unloads.
 */
export function GuestIdentityChoice({
  mode,
  continueHref,
  userId,
  name,
  token,
  locale,
  translations: t,
  errorMessages,
}: {
  mode: "member" | "newcomer";
  /** member only: where evaluateJoin would have redirected. */
  continueHref?: string;
  userId: string;
  name: string;
  token: string;
  locale: string;
  translations: GuestIdentityTranslations;
  /** errors.codes, for the confirm dialog. */
  errorMessages: Record<string, string>;
}) {
  const router = useRouter();
  const feedback = useActionFeedback();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unsynced, setUnsynced] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [busy, startBusy] = useTransition();

  // Focus lands on the question when the screen appears (also after a refresh).
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const lookup = async (): Promise<GuestLookup> => {
    try {
      const { data, error } = await createClient().auth.getUser();
      return classifyGuestLookup(userId, { user: data.user, error });
    } catch {
      return "unreachable";
    }
  };

  const recount = useCallback(() => {
    countWarnable(userId)
      .then(setUnsynced)
      .catch(() => {});
  }, [userId]);

  // Dialog opens: verify identity, then (online) push this guest's own saved
  // drafts like the sign-out guard does, then count what is STILL unsynced.
  useEffect(() => {
    if (!confirmOpen) return;
    let cancelled = false;
    void (async () => {
      const same = await lookup();
      if (cancelled) return;
      if (same === "different") {
        router.refresh();
        setConfirmOpen(false);
        return;
      }
      recount();
      if (same === "same" && typeof navigator !== "undefined" && navigator.onLine) setSyncing(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmOpen, userId]);

  const syncDone = useCallback(() => {
    setSyncing(false);
    recount();
  }, [recount]);

  // M5: never wait for the sync forever. After the cap the button works; a late
  // completion still updates the count through syncDone.
  useEffect(() => {
    if (!syncing) return;
    const timer = setTimeout(syncDone, SYNC_CAP_MS);
    return () => clearTimeout(timer);
  }, [syncing, syncDone]);

  const notMe = async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false as const, error: "offline" };
    }
    // Never end another person's (or a REGISTERED user's) session from here.
    const same = await lookup();
    if (same === "unreachable") return { ok: false as const, error: "unknown" };
    if (same === "different") {
      router.refresh();
      setConfirmOpen(false);
      return;
    }
    let result;
    try {
      result = await signOut(locale, "local");
    } catch {
      return { ok: false as const, error: "unknown" };
    }
    if (!result.ok) return { ok: false as const, error: result.error };
    await clearLocalDeviceState();
    setLeaving(true);
    // Full navigation to the SAME join URL: auth cookies changed and the server
    // component must render with no user. Not the landing page.
    window.location.assign(new URL(`/${locale}/join/${token}`, window.location.origin).href);
    // Keep the dialog pending while the navigation loads (L4).
    return new Promise<never>(() => {});
  };

  const checkedAction = (act: () => Promise<void> | void) => {
    startBusy(async () => {
      const same = await lookup();
      if (same === "unreachable") {
        feedback.notifyError(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "unknown");
        return;
      }
      if (same === "different") {
        router.refresh();
        return;
      }
      await act();
    });
  };

  const continueAsThisGuest = () =>
    checkedAction(async () => {
      if (mode === "member" && continueHref) {
        router.push(continueHref);
        return;
      }
      // A successful join redirects server-side (handled by feedback.run).
      const result = await feedback.run(joinSessionAsGuest(token, locale));
      // Refused (closed / expired / full…): show the page's refusal screen
      // instead of a button that fails every time.
      if (!result.ok) router.refresh();
    });

  const unsyncedLine = fillTemplate(t.unsyncedTemplate, { name, count: String(unsynced) });
  const disabled = busy || leaving;

  return (
    <section aria-labelledby="identity-title" className="space-y-4">
      <div>
        <h2
          id="identity-title"
          ref={titleRef}
          tabIndex={-1}
          className="break-words font-serif text-xl font-semibold text-on-surface outline-none"
        >
          {t.title}
        </h2>
        <p className="mt-1 break-words text-sm text-on-surface-variant">{t.lead}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Button wrap className="w-full" onClick={continueAsThisGuest} disabled={disabled} aria-busy={busy}>
          {busy && mode === "newcomer" ? t.joining : t.continueLabel}
        </Button>
        <Button wrap variant="secondary" className="w-full" onClick={() => setConfirmOpen(true)} disabled={disabled}>
          {t.notMeLabel}
        </Button>
      </div>
      {confirmOpen && syncing && <PendingNotesSync userId={userId} onDone={syncDone} />}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!leaving) setConfirmOpen(o);
        }}
        title={t.confirmTitle}
        body={
          <div className="space-y-3 break-words">
            <p>{t.confirmBody}</p>
            {syncing && (
              <p role="status" className="text-on-surface-variant">
                {t.syncing}
              </p>
            )}
            {!syncing && unsynced > 0 && (
              <p role="alert" className="font-medium text-error">
                {unsyncedLine}
              </p>
            )}
          </div>
        }
        confirmLabel={t.confirmButton}
        cancelLabel={t.cancel}
        closeLabel={t.close}
        confirmDisabled={syncing || leaving}
        errorMessages={errorMessages}
        onConfirm={notMe}
      />
    </section>
  );
}
