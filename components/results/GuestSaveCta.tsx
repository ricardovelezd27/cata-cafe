"use client";

import { useState, useSyncExternalStore } from "react";
import { Mail, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useConnectivity } from "@/hooks/useConnectivity";
import { Button } from "@/components/ui";

const DISMISS_EVENT = "cata-guest-cta-dismiss";

// Dismissal lives in sessionStorage — "Ahora no" means exactly that: quiet for
// the rest of this visit, back on the next one (this banner is the app's only
// guest→account conversion surface, so a permanent dismissal would orphan the
// guest's data forever). Read via an external store (same pattern as
// ResultsClient's Tabla/Gráfico persistence) so we avoid setState-in-effect
// and hydration mismatches: the server snapshot reports "dismissed", so the
// banner only appears after hydration confirms it was never dismissed.
function subscribeDismissed(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(DISMISS_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(DISMISS_EVENT, cb);
  };
}

export type GuestSaveCtaTranslations = {
  title: string;
  body: string;
  emailLabel: string;
  emailPlaceholder: string;
  submit: string;
  sending: string;
  pendingTitle: string;
  /** Contains a literal `{email}` placeholder, substituted client-side. */
  pendingBody: string;
  changeEmail: string;
  dismiss: string;
  offline: string;
  errorGeneric: string;
  errorEmailTaken: string;
  errorRateLimit: string;
  loginInstead: string;
  loginLosesData: string;
};

/**
 * "Guarda tus resultados" — converts an anonymous guest into a registered
 * account IN PLACE. `supabase.auth.updateUser({ email })` on an anonymous
 * session keeps the same user id (evaluations, profile and participations all
 * survive) and sends a verification email; the customized "Change Email
 * Address" template routes through /auth/callback (token_hash + type=
 * email_change) back to this results page, where `is_anonymous` is false and
 * the banner no longer renders.
 *
 * Valor antes que fricción: the banner is dismissible (quiet for the rest of
 * the visit, back on the next one) and never blocks the results underneath it.
 */
export function GuestSaveCta({
  sessionId,
  locale,
  pendingEmail,
  translations: t,
}: {
  sessionId: string;
  locale: string;
  /** `user.new_email` from the server — a conversion already awaiting verification. */
  pendingEmail: string | null;
  translations: GuestSaveCtaTranslations;
}) {
  const dismissKey = `cata_guest_cta_dismissed_${sessionId}`;

  const storedDismissed = useSyncExternalStore(
    subscribeDismissed,
    () => {
      try {
        return sessionStorage.getItem(dismissKey) === "1";
      } catch {
        return false;
      }
    },
    // Server snapshot: hidden — the banner appears only after hydration.
    () => true,
  );
  // Fallback when sessionStorage is unavailable (the event still fires but the
  // snapshot can't change): hide for this page view at least.
  const [locallyDismissed, setLocallyDismissed] = useState(false);

  const [phase, setPhase] = useState<"idle" | "sending" | "pending">(
    pendingEmail ? "pending" : "idle",
  );
  const [sentTo, setSentTo] = useState<string | null>(pendingEmail);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<"generic" | "taken" | "rateLimit" | null>(null);
  const { online } = useConnectivity();

  if (storedDismissed || locallyDismissed) return null;

  const resultsPath = `/${locale}/app/sessions/${sessionId}/results`;
  // The registered account is (usually) not a participant of this session, so
  // send a "log in instead" user to the dashboard — not back here, where a
  // different account would hit a 404.
  const loginHref = `/${locale}/auth/login?next=${encodeURIComponent(`/${locale}/app`)}`;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(dismissKey, "1");
    } catch {
      // Best effort — the local flag below still hides it.
    }
    setLocallyDismissed(true);
    window.dispatchEvent(new Event(DISMISS_EVENT));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || phase === "sending" || !online) return;

    setError(null);
    setPhase("sending");
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser(
        { email: trimmed },
        // Final destination, not /auth/callback — the customized email
        // template threads it as `next` via {{ .RedirectTo }} (same convention
        // as signInWithMagicLink in app/actions/auth.ts).
        { emailRedirectTo: `${window.location.origin}${resultsPath}` },
      );
      if (updateError) {
        const code = (updateError as { code?: string }).code;
        const status = (updateError as { status?: number }).status;
        const taken =
          code === "email_exists" || /already.*(regist|exist)/i.test(updateError.message ?? "");
        const rateLimited =
          code === "over_email_send_rate_limit" ||
          status === 429 ||
          /rate limit/i.test(updateError.message ?? "");
        setError(taken ? "taken" : rateLimited ? "rateLimit" : "generic");
        setPhase("idle");
        return;
      }
      setSentTo(trimmed);
      setPhase("pending");
    } catch {
      setError("generic");
      setPhase("idle");
    }
  };

  return (
    <section
      aria-label={t.title}
      className="relative mx-4 mt-4 rounded-card border border-secondary/30 bg-secondary-container/20 p-4 pr-10 lg:mx-6"
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t.dismiss}
        title={t.dismiss}
        className="absolute right-2 top-2 rounded-pill p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <X size={16} aria-hidden />
      </button>

      <div className="flex items-start gap-3">
        <Mail size={18} aria-hidden className="mt-0.5 shrink-0 text-secondary" />
        {phase === "pending" ? (
          <div role="status" className="min-w-0">
            <p className="font-sans text-sm font-semibold text-on-surface">{t.pendingTitle}</p>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {t.pendingBody.replace("{email}", sentTo ?? "")}
            </p>
            <button
              type="button"
              onClick={() => {
                setPhase("idle");
                setError(null);
              }}
              className="mt-2 text-xs font-medium text-primary-container underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t.changeEmail}
            </button>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="font-sans text-sm font-semibold text-on-surface">{t.title}</p>
            <p className="mt-0.5 text-xs text-on-surface-variant">{t.body}</p>

            <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.emailPlaceholder}
                aria-label={t.emailLabel}
                autoComplete="email"
                inputMode="email"
                disabled={phase === "sending"}
                className="w-full rounded-input border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant transition-colors focus:border-primary-container focus:outline-none focus:ring-2 focus:ring-primary-container/25 sm:max-w-xs"
              />
              <Button
                type="submit"
                size="sm"
                disabled={phase === "sending" || !online || !email.trim()}
                className="sm:shrink-0"
              >
                {phase === "sending" ? t.sending : t.submit}
              </Button>
            </form>

            {!online && <p className="mt-2 text-xs text-on-surface-variant">{t.offline}</p>}
            {error === "generic" && (
              <p role="alert" className="mt-2 text-xs text-error">
                {t.errorGeneric}
              </p>
            )}
            {error === "rateLimit" && (
              <p role="alert" className="mt-2 text-xs text-error">
                {t.errorRateLimit}
              </p>
            )}
            {error === "taken" && (
              <div role="alert" className="mt-2 space-y-1">
                <p className="text-xs text-error">{t.errorEmailTaken}</p>
                <p className="text-xs text-on-surface-variant">
                  <a
                    href={loginHref}
                    className="font-medium text-primary-container underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {t.loginInstead}
                  </a>{" "}
                  — {t.loginLosesData}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
