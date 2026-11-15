"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sendMagicLink } from "@/lib/magicLink";
import { reserveEmailBudget } from "@/lib/emailBudget";
import { parseClientIp } from "@/lib/requestIp";
import { NEWSLETTER_NOTICE_VERSION, foundingUpgrade, newsletterWrite } from "@/lib/newsletter";
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
 * TODO(owner): enforcing the cap (what the 101st person sees) is the owner's call.
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
      if (code !== "P2002") {
        logWarn({ where: "reserveFoundingSeat", message: "waitlist_write_failed", code });
        return;
      }
      // The address had a row already. If it was only a newsletter
      // subscription (lib/newsletter.ts), it becomes a founding reservation
      // that keeps the opt-in; the guard on `plan` makes this safe to repeat.
      try {
        const existing = await prisma.waitlistEntry.findUnique({
          where: { email },
          select: { plan: true, source: true, consentAt: true, createdAt: true },
        });
        const upgrade = existing ? foundingUpgrade(existing, source) : null;
        if (existing && upgrade) {
          // Dated today: the place among the founders is the day of the
          // reservation, not the day of the newsletter sign-up.
          await prisma.waitlistEntry.updateMany({
            where: { email, plan: existing.plan },
            data: {
              ...upgrade,
              createdAt: new Date(),
              ...consentStamp(LEGAL_PAGES_PUBLISHED, CONSENT_NOTICE_VERSION),
            },
          });
        }
      } catch {
        logWarn({ where: "reserveFoundingSeat", message: "newsletter_upgrade_failed" });
      }
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

export type NewsletterState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; code: "invalid_email" | "server" | "rate_limit" };

/**
 * Newsletter sign-up (the landing page's closing block). It records that the
 * address asked for the newsletter, when, and under which notice. It sends NO
 * email and creates NO account; where the record lives and for how long is in
 * lib/newsletter.ts.
 *
 * A public, unauthenticated form: a honeypot, the same address check as the
 * reservation, and a limit per address and per IP. The limit reuses the
 * ledger's "attempt" kind (`code_verify`: no recipients, 10 per address and
 * 120 per IP in 15 minutes) with its own subject prefix, so newsletter
 * attempts and sign-in attempts never share a bucket per address.
 */
export async function subscribeNewsletter(
  _prev: NewsletterState,
  formData: FormData,
): Promise<NewsletterState> {
  if (String(formData.get("company") || "") !== "") return { status: "ok" };

  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const locale = formData.get("locale") === "en" ? "en" : "es";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { status: "error", code: "invalid_email" };
  }

  try {
    const h = await headers();
    const budget = await reserveEmailBudget({
      kind: "code_verify",
      ip: parseClientIp(h.get("x-forwarded-for")),
      subject: `newsletter:${email}`,
    });
    if (!budget.allowed) return { status: "error", code: "rate_limit" };

    const now = new Date();
    const existing = await prisma.waitlistEntry.findUnique({
      where: { email },
      select: { plan: true, source: true },
    });
    const write = newsletterWrite(existing, formData.get("src"), now);
    if (write.kind === "create") {
      await prisma.waitlistEntry.create({
        data: {
          email,
          locale,
          plan: write.plan,
          source: write.source,
          consentAt: now,
          consentNoticeVersion: NEWSLETTER_NOTICE_VERSION,
        },
      });
    } else if (write.kind === "mark" && existing) {
      // Guarded on the source we read: a concurrent change makes this a no-op.
      await prisma.waitlistEntry.updateMany({
        where: { email, source: existing.source },
        data: { source: write.source },
      });
    }
    return { status: "ok" };
  } catch (e) {
    const code =
      typeof e === "object" && e !== null && "code" in e ? (e as { code: string }).code : "";
    // Two submits at once: the other one made the row. Already subscribed.
    if (code === "P2002") return { status: "ok" };
    logWarn({ where: "subscribeNewsletter", message: "newsletter_write_failed", code });
    return { status: "error", code: "server" };
  }
}
