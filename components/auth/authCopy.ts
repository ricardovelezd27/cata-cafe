import { AUTH_ERROR_KEYS, type AuthErrorKey } from "@/lib/authErrors";
import type { EmailSentLabels } from "./EmailSentState";

// Builds the client-side copy for the sign-in screens from a server-side
// `getTranslations("auth")`. Strings with ICU arguments ({email},
// {seconds}) are fetched raw and filled in on the client; calling t() without
// the arg would render the raw key.
type T = {
  (key: string): string;
  raw: (key: string) => unknown;
};

export function authErrorCopy(t: T): Record<AuthErrorKey, string> {
  return Object.fromEntries(AUTH_ERROR_KEYS.map((k) => [k, t(`errors.${k}`)])) as Record<
    AuthErrorKey,
    string
  >;
}

export function emailSentCopy(t: T): EmailSentLabels {
  return {
    title: t("sentState.title"),
    body: t.raw("sentState.body") as string,
    codeLabel: t("sentState.codeLabel"),
    codeHint: t("sentState.codeHint"),
    codeSubmit: t("sentState.codeSubmit"),
    codeSubmitting: t("sentState.codeSubmitting"),
    resend: t("sentState.resend"),
    resendIn: t.raw("sentState.resendIn") as string,
    resent: t("sentState.resent"),
    changeEmail: t("sentState.changeEmail"),
    support: t("sentState.support"),
    errors: authErrorCopy(t),
  };
}
