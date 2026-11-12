"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { joinSessionAsGuest } from "@/app/actions/join";
import { createClient } from "@/lib/supabase/client";
import { countWarnable } from "@/lib/offline/store";
import { clearLocalDeviceState } from "@/lib/offline/deviceState";
import { isSameAnonymousGuest } from "@/lib/joinRules";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Button, ButtonLink, ConfirmDialog, useActionFeedback } from "@/components/ui";

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
  /** Pending joins show this label while the request runs. */
  joining: string;
};

// Long names must wrap inside the kit's whitespace-nowrap buttons.
const WRAP = "h-auto w-full whitespace-normal break-words py-2 text-center";

/** Pure single-pass template fill: no `$&`-style patterns, and a literal
 *  "{count}" inside a name is never substituted. */
function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(name|count)\}/g, (_m, key: string) => values[key] ?? "");
}

/** Mounted only while the "No soy" dialog is open and the identity is verified:
 *  runs the same replay the sign-out guard runs (useOfflineSync.retrySync) for
 *  THIS guest's own saved drafts, then reports back. */
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
 *  - "Continuar como X": a member goes where `evaluateJoin` sent them
 *    (`continueHref`); a newcomer joins through `joinSessionAsGuest`, after
 *    re-checking that the browser is still signed in as THIS guest.
 *  - "No soy X": confirm, then `signOut(locale, "local")` FIRST and only after
 *    the server succeeded `clearLocalDeviceState()` (same order as
 *    SignOutButton). Nothing is deleted from the draft store: drafts are keyed
 *    by user id and simply stay. Then a hard navigation back to this same join
 *    URL, which re-runs the normal decision (guest form, or the refusal screen
 *    when the link is closed / expired / full / entries-locked).
 *  - Never acts for another person: every action first compares the browser's
 *    current user with `userId` (the guest this screen was rendered for) via
 *    `isSameAnonymousGuest`; a stale tab whose session changed (a different
 *    guest, or a registered user) only refreshes.
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
  const [joining, startJoin] = useTransition();

  // Focus lands on the question when the screen appears (also after a refresh).
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const currentIsThisGuest = async (): Promise<boolean | "error"> => {
    try {
      const {
        data: { user },
        error,
      } = await createClient().auth.getUser();
      if (error && !user) return "error";
      return isSameAnonymousGuest(userId, user);
    } catch {
      return "error";
    }
  };

  // Dialog opens: verify identity, then (online) push this guest's own saved
  // drafts like the sign-out guard does, then count what is STILL unsynced.
  // Store counting is the guard's rule (countWarnable); client-only by nature.
  useEffect(() => {
    if (!confirmOpen) return;
    let cancelled = false;
    void (async () => {
      const same = await currentIsThisGuest();
      if (cancelled) return;
      if (same === false) {
        router.refresh();
        setConfirmOpen(false);
        return;
      }
      setUnsynced(await countWarnable(userId).catch(() => 0));
      if (same === true && typeof navigator !== "undefined" && navigator.onLine && !cancelled) {
        setSyncing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmOpen, userId]);

  const syncDone = () => {
    setSyncing(false);
    countWarnable(userId)
      .then(setUnsynced)
      .catch(() => {});
  };

  const notMe = async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      feedback.notifyError("offline");
      return { ok: false as const, error: "offline" };
    }
    // Never end another person's (or a REGISTERED user's) session from here.
    const same = await currentIsThisGuest();
    if (same === "error") return { ok: false as const, error: "unknown" };
    if (!same) {
      router.refresh();
      setConfirmOpen(false);
      return;
    }
    const result = await feedback.run(signOut(locale, "local"), async () => {
      await clearLocalDeviceState();
      // Full navigation to the SAME join URL: auth cookies changed and the
      // server component must render with no user. Not the landing page.
      window.location.assign(new URL(`/${locale}/join/${token}`, window.location.origin).href);
    });
    return result.ok ? undefined : { ok: false as const, error: result.error };
  };

  const joinAsThisGuest = () => {
    startJoin(async () => {
      const same = await currentIsThisGuest();
      if (same === "error") {
        feedback.notifyError(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "unknown");
        return;
      }
      if (!same) {
        router.refresh();
        return;
      }
      // A successful join redirects server-side (handled by feedback.run).
      await feedback.run(joinSessionAsGuest(token, locale));
    });
  };

  const unsyncedLine = fillTemplate(t.unsyncedTemplate, { name, count: String(unsynced) });

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
        {mode === "member" && continueHref ? (
          <ButtonLink href={continueHref} className={WRAP}>
            {t.continueLabel}
          </ButtonLink>
        ) : (
          <Button className={WRAP} onClick={joinAsThisGuest} disabled={joining} aria-busy={joining}>
            {joining ? t.joining : t.continueLabel}
          </Button>
        )}
        <Button variant="secondary" className={WRAP} onClick={() => setConfirmOpen(true)}>
          {t.notMeLabel}
        </Button>
      </div>
      {confirmOpen && syncing && <PendingNotesSync userId={userId} onDone={syncDone} />}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
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
        confirmDisabled={syncing}
        errorMessages={errorMessages}
        onConfirm={notMe}
      />
    </section>
  );
}
