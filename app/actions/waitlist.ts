"use server";

import { prisma } from "@/lib/prisma";
import { sendMagicLink } from "@/lib/magicLink";
import { logWarn } from "@/lib/log";
import { waitlistSource } from "@/lib/waitlistSource";
import { CONSENT_NOTICE_VERSION, LEGAL_PAGES_PUBLISHED } from "@/lib/legal/config";
import { consentStamp } from "@/lib/legal/consent";

export type WaitlistState =
  | { status: "idle" }
  | { status: "ok"; email?: string }
  | { status: "error"; code: "invalid_email" | "server" | "rate_limit"; retryAfterMs?: number };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Founding-seat reservation = the account itself. Records the founding-cohort
 * entry (so "the first 100" stays countable) and sends the magic link that
 * creates / signs in the account, landing on /app.
 */
export async function reserveFoundingSeat(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  if (String(formData.get("company") || "") !== "") return { status: "ok" };

  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const locale = formData.get("locale") === "en" ? "en" : "es";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { status: "error", code: "invalid_email" };
  }

  // F-landing-6: cohort source, validated server-side (allowlisted variant +
  // sanitized tag), never a raw client string.
  const source = waitlistSource(formData.get("variant"), formData.get("src"));

  // One reservation per signup: the budget is checked first, the entry is
  // recorded only if the send is allowed, then the link goes out. The default
  // destination (/{locale}/app) comes from the locale.
  const sent = await sendMagicLink(email, { locale }, async () => {
    try {
      await prisma.waitlistEntry.create({
        data: {
          email,
          locale,
          source,
          // F-landing-1: the consent record, null until the notice is actually
          // shown (LEGAL_PAGES_PUBLISHED). TODO(S8-07): deleteAccount must
          // delete this row by email (+ test) once deleteAccount exists.
          ...consentStamp(LEGAL_PAGES_PUBLISHED, CONSENT_NOTICE_VERSION),
        },
      });
    } catch (e) {
      const code =
        typeof e === "object" && e !== null && "code" in e ? (e as { code: string }).code : "";
      // Duplicate → already reserved; anything else must not block the sign-in.
      if (code !== "P2002") logWarn({ where: "reserveFoundingSeat", message: "waitlist_write_failed", code });
    }
  });
  if (!sent.ok) {
    return {
      status: "error",
      code: sent.error === "rate_limited" ? "rate_limit" : "server",
      ...(sent.retryAfterMs ? { retryAfterMs: sent.retryAfterMs } : {}),
    };
  }
  return { status: "ok", email };
}
