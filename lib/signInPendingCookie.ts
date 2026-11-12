import "server-only";

import { cookies } from "next/headers";
import {
  SIGNIN_PENDING_COOKIE,
  SIGNIN_PENDING_MAX_AGE_S,
  decodePending,
  encodePending,
  type PendingTokens,
} from "@/lib/signInPending";

// Cookie plumbing for the pending sign-in (S9-02, A-08). Server actions only:
// app/actions/auth.ts is the single reader/writer/deleter. proxy.ts, layouts
// and the callback route never read it.

/** Stores the verified tokens for up to 10 minutes. False when they do not fit. */
export async function storePendingSignIn(tokens: PendingTokens): Promise<boolean> {
  const value = encodePending(tokens);
  if (!value) return false;
  const jar = await cookies();
  jar.set(SIGNIN_PENDING_COOKIE, value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SIGNIN_PENDING_MAX_AGE_S,
  });
  return true;
}

export async function readPendingSignIn(): Promise<PendingTokens | null> {
  const jar = await cookies();
  return decodePending(jar.get(SIGNIN_PENDING_COOKIE)?.value);
}

export async function clearPendingSignIn(): Promise<void> {
  const jar = await cookies();
  jar.delete(SIGNIN_PENDING_COOKIE);
}
