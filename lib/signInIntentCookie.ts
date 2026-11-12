import "server-only";

import { cookies } from "next/headers";
import {
  SIGNIN_INTENT_COOKIE,
  SIGNIN_INTENT_MAX_AGE_S,
  decideSignInIntent,
  mintIntentValue,
  type SignInIntentDecision,
} from "@/lib/signInIntent";

// Cookie plumbing for the sign-in intent (S9-02, A-08). Same secret pattern as
// lib/emailKeys.ts; the cookie holds HMACs only, never an address.

function secret(): string {
  const s = process.env.GUEST_CLAIM_SECRET ||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("guest_claim_secret_missing");
  return s;
}

/**
 * Remembers in THIS browser that a sign-in for `emails` was requested. Only
 * callable where cookies are writable (server actions, route handlers); never
 * throws: a failure only means the identity card is shown later.
 */
export async function rememberSignInIntent(emails: readonly string[]): Promise<boolean> {
  try {
    const jar = await cookies();
    const value = mintIntentValue(secret(), emails, jar.get(SIGNIN_INTENT_COOKIE)?.value);
    jar.set(SIGNIN_INTENT_COOKIE, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SIGNIN_INTENT_MAX_AGE_S,
    });
    return true;
  } catch {
    return false;
  }
}

export async function checkSignInIntent(userEmail: string | null | undefined): Promise<SignInIntentDecision> {
  try {
    const jar = await cookies();
    return decideSignInIntent(secret(), jar.get(SIGNIN_INTENT_COOKIE)?.value, userEmail);
  } catch {
    return "confirm";
  }
}

export async function clearSignInIntent(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(SIGNIN_INTENT_COOKIE);
  } catch {
    // best effort
  }
}
