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
import { evaluateJoin, joinRefusalCode } from "@/lib/joinRules";
import type { ActionResult } from "@/lib/actionResult";

export type JoinFormState = ActionResult<void> | null;

/**
 * Called by the guest form BEFORE it creates an anonymous user (S8-07,
 * F-guest-3): a closed, expired, revoked, unknown or full link, or a session
 * whose entries are closed (S8-11), answers with its own
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
        active: true,
        expiresAt: true,
        maxUses: true,
        useCount: true,
        session: {
          select: {
            id: true,
            status: true,
            closesAt: true,
            startedAt: true,
            isGroup: true,
            isAsync: true,
            createdBy: true,
            entriesLocked: true,
          },
        },
      },
    });
    // The same pure rule as the /join page and joinViaToken (lib/joinRules.ts),
    // so entries closed and a revoked link are refused here too, BEFORE the
    // guest form mints an anonymous user. The caller has no account yet, so
    // it is always judged as a newcomer.
    const decision = evaluateJoin(
      { invite, session: invite?.session ?? null, viewer: { userId: null, isMember: false } },
      "es",
    );
    const refusal = joinRefusalCode(decision);
    if (refusal) throw new Error(refusal);
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

/** Programmatic (non-form) twin of joinSessionForm for GuestJoinForm: the guest
 *  signs in anonymously on the client, then this joins and redirects. Failures
 *  come back as an ActionResult instead of an opaque production digest. */
export async function joinSessionAsGuest(token: string, locale: string): Promise<ActionResult<void>> {
  return run("joinSessionAsGuest", async () => {
    await joinViaToken(token, locale);
  });
}
