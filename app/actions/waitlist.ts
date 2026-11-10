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
 * entry (so the founding cohort stays countable) and sends the magic link that
 * creates / signs in the account, landing on /app.
 *
 * F-landing-5: the cohort size lives in lib/landing/founding.ts (copy only).
 * This action never counts rows and never refuses a signup because the cohort
 * is "full"; a duplicate email is idempotent (P2002 below).
 * TODO(S8-14): enforcing the cap (what the 101st person sees) is the owner's call.
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
          // shown (LEGAL_PAGES_PUBLISHED). deleteAccount removes this row by
          // the lowercased email (S8-19; tests/accountDeletion.test.ts).
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
