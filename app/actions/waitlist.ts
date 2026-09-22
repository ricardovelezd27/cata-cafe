"use server";

import { prisma } from "@/lib/prisma";
import { signInWithMagicLink } from "./auth";
import { logWarn } from "@/lib/log";

export type WaitlistState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; code: "invalid_email" | "server" | "rate_limit" };

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

  try {
    await prisma.waitlistEntry.create({ data: { email, locale } });
  } catch (e) {
    const code =
      typeof e === "object" && e !== null && "code" in e ? (e as { code: string }).code : "";
    // Duplicate → already reserved; anything else must not block the sign-in.
    if (code !== "P2002") logWarn({ where: "reserveFoundingSeat", message: "waitlist_write_failed", code });
  }

  const fd = new FormData();
  fd.set("email", email);
  const next = locale === "es" ? "/app" : "/en/app";
  const sent = await signInWithMagicLink(fd, next);
  if (!sent.ok) {
    return {
      status: "error",
      code: sent.error === "over_email_send_rate_limit" ? "rate_limit" : "server",
    };
  }
  return { status: "ok" };
}

