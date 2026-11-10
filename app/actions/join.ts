"use server";

// Thin form-shaped wrappers around the real join actions, built for React 19
// useActionState (components/join/JoinSessionForm.tsx, JoinCoffeeForm.tsx).
// joinViaToken (community.ts) and joinCoffeeViaToken (coffees.ts) redirect()
// on success — that throw passes straight through run() via unstable_rethrow
// — and only surface an ActionResult when the token turns out to be
// invalid/expired/exhausted.

import { joinViaToken } from "@/app/actions/community";
import { joinCoffeeViaToken } from "@/app/actions/coffees";
import { run } from "@/lib/safeAction";
import { prisma } from "@/lib/prisma";
import { joinBlock } from "@/lib/joinability";
import type { ActionResult } from "@/lib/actionResult";

export type JoinFormState = ActionResult<void> | null;

/**
 * Called by the guest form BEFORE it creates an anonymous user (S8-07,
 * F-guest-3): a closed, expired, unknown or full link answers with its own
 * code instead of leaving an orphan anonymous account behind. Needs no
 * sign-in on purpose (the guest has none yet) and returns nothing but the
 * verdict, which the /join page already shows to anyone holding the link.
 * joinViaToken re-checks inside its transaction, so a seat taken between this
 * call and the join still fails cleanly.
 */
export async function checkJoinable(token: string): Promise<ActionResult<{ joinable: true }>> {
  return run("checkJoinable", async () => {
    const raw = String(token ?? "");
    if (!raw || raw.length > 128) throw new Error("invalid_token");
    const invite = await prisma.sessionInvite.findUnique({
      where: { token: raw },
      select: {
        expiresAt: true,
        maxUses: true,
        useCount: true,
        session: { select: { status: true, closesAt: true } },
      },
    });
    const block = joinBlock(invite, invite?.session);
    if (block) throw new Error(block);
    return { joinable: true as const };
  });
}

function readTokenAndLocale(formData: FormData): { token: string; locale: string } {
  const token = String(formData.get("token") ?? "");
  const locale = String(formData.get("locale") ?? "es");
  return { token, locale };
}

export async function joinSessionForm(
  _prev: JoinFormState,
  formData: FormData,
): Promise<JoinFormState> {
  const { token, locale } = readTokenAndLocale(formData);
  return run("joinSessionForm", async () => {
    await joinViaToken(token, locale);
  });
}

export async function joinCoffeeForm(
  _prev: JoinFormState,
  formData: FormData,
): Promise<JoinFormState> {
  const { token, locale } = readTokenAndLocale(formData);
  return run("joinCoffeeForm", async () => {
    await joinCoffeeViaToken(token, locale);
  });
}
