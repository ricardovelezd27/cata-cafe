"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { countWarnable } from "@/lib/offline/store";
import { clearLocalDeviceState } from "@/lib/offline/deviceState";
import { Button, ButtonLink, ConfirmDialog, useActionFeedback } from "@/components/ui";
import { JoinSessionForm, type JoinSessionFormTranslations } from "@/components/join/JoinSessionForm";

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
  confirmButton: string;
  cancel: string;
  close: string;
};

/**
 * "¿Eres <nombre>?" (S10 WP8, F-guest-4). Rendered by the join page for an
 * ANONYMOUS viewer on a link they could use (already a member, or a newcomer),
 * so a second person on a shared tablet is not silently acting as the first.
 * TODO(kim-validar:E1): simulated answer.
 *
 *  - "Continuar como X": a member goes where `evaluateJoin` sent them
 *    (`continueHref`); a newcomer submits the normal join form.
 *  - "No soy X": confirm, then `signOut(locale, "local")` FIRST and only after
 *    the server succeeded `clearLocalDeviceState()` (same order as
 *    SignOutButton). Nothing is deleted from the draft store: drafts are keyed
 *    by user id and simply stay. Then a hard navigation back to this same join
 *    URL, so the next person gets the normal guest form.
 *  - Never touches a REGISTERED user: the browser client re-checks
 *    `is_anonymous` and, if the user is not anonymous, only refreshes.
 */
export function GuestIdentityChoice({
  mode,
  continueHref,
  joinForm,
  userId,
  name,
  token,
  locale,
  translations: t,
}: {
  mode: "member" | "newcomer";
  /** member only: where evaluateJoin would have redirected. */
  continueHref?: string;
  /** newcomer only: copy for the existing join form (button = continueLabel). */
  joinForm?: JoinSessionFormTranslations;
  userId: string;
  name: string;
  token: string;
  locale: string;
  translations: GuestIdentityTranslations;
}) {
  const router = useRouter();
  const feedback = useActionFeedback();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unsynced, setUnsynced] = useState(0);

  // Focus lands on the question when the screen appears (also after a refresh).
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Unsynced notes of THIS user on this device: the same store rule the
  // sign-out / claim guard uses (countWarnable). Client-only by nature.
  useEffect(() => {
    let cancelled = false;
    countWarnable(userId)
      .then((n) => {
        if (!cancelled) setUnsynced(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, confirmOpen]);

  const notMe = async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      feedback.notifyError("offline");
      return { ok: false as const, error: "offline" };
    }
    // Never end a REGISTERED user's session from here (stale page, other tab).
    const {
      data: { user },
    } = await createClient().auth.getUser();
    if (!user?.is_anonymous) {
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

  const unsyncedLine = t.unsyncedTemplate.replaceAll("{name}", name).replaceAll("{count}", String(unsynced));

  return (
    <section aria-labelledby="identity-title" className="space-y-4">
      <div>
        <h2
          id="identity-title"
          ref={titleRef}
          tabIndex={-1}
          className="font-serif text-xl font-semibold text-on-surface outline-none"
        >
          {t.title}
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">{t.lead}</p>
      </div>
      <div className="flex flex-col gap-2">
        {mode === "member" && continueHref ? (
          <ButtonLink href={continueHref} className="w-full">
            {t.continueLabel}
          </ButtonLink>
        ) : joinForm ? (
          <JoinSessionForm token={token} locale={locale} translations={{ ...joinForm, button: t.continueLabel }} />
        ) : null}
        <Button variant="secondary" className="w-full" onClick={() => setConfirmOpen(true)}>
          {t.notMeLabel}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t.confirmTitle}
        body={
          <div className="space-y-3">
            <p>{t.confirmBody}</p>
            {unsynced > 0 && (
              <p role="alert" className="font-medium text-error">
                {unsyncedLine}
              </p>
            )}
          </div>
        }
        confirmLabel={t.confirmButton}
        cancelLabel={t.cancel}
        closeLabel={t.close}
        onConfirm={notMe}
      />
    </section>
  );
}
