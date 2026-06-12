"use server";

import { prisma } from "@/lib/prisma";

export type WaitlistState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; code: "invalid_email" | "server" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  // Honeypot: real users never fill this hidden field.
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
    // Duplicate email → idempotent success (avoids email enumeration).
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return { status: "ok" };
    }
    return { status: "error", code: "server" };
  }

  return { status: "ok" };
}
