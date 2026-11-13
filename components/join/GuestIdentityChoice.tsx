"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { joinSessionAsGuest } from "@/app/actions/join";
import { createClient } from "@/lib/supabase/client";
import { countWarnable } from "@/lib/offline/store";
import { clearLocalDeviceState } from "@/lib/offline/deviceState";
import { classifyGuestLookup, isFinalJoinRefusal, type GuestLookup } from "@/lib/joinRules";
import { announceIdentityLeft } from "@/lib/identityChange";
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
function PendingNotesSync({ userId, run, onDone }: { userId: string; run: number; onDone: (run: number) => void }) {
  const { online } = useConnectivity();
  const { retrySync } = useOfflineSync({ userId, online });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void retrySync().finally(() => onDone(run));
  }, [retrySync, onDone, run]);
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
  // Run id of the sync started by the CURRENT dialog opening (null = none).
  // Completions of an earlier opening carry an older id and are ignored (L3).
  const [syncRun, setSyncRun] = useState<number | null>(null);
  const syncing = syncRun !== null;
  // True from the moment the dialog opens until the identity lookup AND the
  // awaited unsynced count are done, so "Soy otra persona" can never be tapped
  // before the warning exists (M1). Also true when offline: the count still runs.
  const [checking, setChecking] = useState(false);
  const openRunRef = useRef(0);
  const [leaving, setLeaving] = useState(false);
  const [busy, startBusy] = useTransition();

  // Focus lands on the question when the screen appears (also after a refresh).
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // M2: after location.assign this screen is deliberately frozen (`leaving`). A
  // page restored from the back/forward cache would stay frozen, so reload it,
  // but ONLY when this screen was left through "No soy" (fourth review: not on
  // every restore, which would reload a screen the person never left).
  const leavingRef = useRef(false);
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && leavingRef.current) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const closeDialog = () => {
    openRunRef.current += 1; // invalidates any lookup / sync still in flight
    setSyncRun(null);
    setChecking(false);
    setConfirmOpen(false);
  };

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

  // Dialog opens: verify identity, count this guest's unsynced notes, then
  // (online) push this guest's own saved drafts like the sign-out guard does and
  // count what is STILL unsynced. Each opening has its own run id (L3).
  useEffect(() => {
    if (!confirmOpen) return;
    const run = ++openRunRef.current;
    const current = () => run === openRunRef.current;
    void (async () => {
      const same = await lookup();
      if (!current()) return;
      if (same === "different") {
        router.refresh();
        closeDialog();
        return;
      }
      try {
        const n = await countWarnable(userId);
        if (!current()) return;
        setUnsynced(n);
      } catch {
        // the count stays as it was; the warning is best effort
      }
      if (!current()) return;
      setChecking(false);
      if (same === "same" && typeof navigator !== "undefined" && navigator.onLine) setSyncRun(run);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmOpen, userId]);

  const syncDone = useCallback(
    (run: number) => {
      if (run !== openRunRef.current) return;
      setSyncRun(null);
      recount();
    },
    [recount],
  );

  // M5: never wait for the sync forever. After the cap the button works; a late
  // completion of the SAME opening still updates the count through syncDone.
  useEffect(() => {
    if (syncRun === null) return;
    const run = syncRun;
    const timer = setTimeout(() => syncDone(run), SYNC_CAP_MS);
    return () => clearTimeout(timer);
  }, [syncRun, syncDone]);

  const notMe = async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false as const, error: "offline" };
    }
    // Never end another person's (or a REGISTERED user's) session from here.
    const same = await lookup();
    if (same === "unreachable") return { ok: false as const, error: "unknown" };
    if (same === "different") {
      router.refresh();
      closeDialog();
      return;
    }
    let result;
    try {
      result = await signOut(locale, "local");
    } catch {
      return { ok: false as const, error: "unknown" };
    }
    if (!result.ok) return { ok: false as const, error: result.error };
    // Other tabs on this device still show this guest: tell them (they stop
    // saving and ask for a reload).
    announceIdentityLeft(userId);
    await clearLocalDeviceState();
    leavingRef.current = true;
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
      // A successful join redirects server-side (NEXT_REDIRECT, never swallowed).
      let result;
      try {
        result = await joinSessionAsGuest(token, locale);
      } catch (err) {
        const digest = (err as { digest?: unknown } | null)?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
        feedback.notifyError(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "unknown");
        return;
      }
      if (result.ok) return;
      // L5: a final refusal (closed / expired / full / locked) is ONE message:
      // the page's own refusal screen. No toast on top of it.
      if (isFinalJoinRefusal(result.error)) router.refresh();
      else feedback.notifyError(result.error);
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
        <Button wrap variant="secondary" className="w-full" onClick={() => { setChecking(true); setConfirmOpen(true); }} disabled={disabled}>
          {t.notMeLabel}
        </Button>
      </div>
      {confirmOpen && syncRun !== null && <PendingNotesSync key={syncRun} userId={userId} run={syncRun} onDone={syncDone} />}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (leaving) return;
          if (o) setConfirmOpen(true);
          else closeDialog();
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
            {!checking && !syncing && unsynced > 0 && (
              <p role="alert" className="font-medium text-error">
                {unsyncedLine}
              </p>
            )}
          </div>
        }
        confirmLabel={t.confirmButton}
        cancelLabel={t.cancel}
        closeLabel={t.close}
        confirmDisabled={checking || syncing || leaving}
        errorMessages={errorMessages}
        onConfirm={notMe}
      />
    </section>
  );
}
