import "server-only";

import { createHmac } from "node:crypto";

// Keys for the outbound-email ledger (S8-03). The ledger never stores a raw
// IP or a raw address: both are HMAC'd with the same secret the guest-claim
// tokens use, under a domain-separation prefix so a ledger key can never
// equal a claim signature (lib/guestClaim.ts signs a bare payload).

function secret(): string {
  const s = process.env.GUEST_CLAIM_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("guest_claim_secret_missing");
  return s;
}

function hmac(prefix: string, value: string): string {
  return createHmac("sha256", secret()).update(`${prefix}:${value}`).digest("base64url");
}

/** Bucket key for an unauthenticated sender, from the request IP. */
export function actorKeyForIp(ip: string): string {
  return `ip_${hmac("email-actor", ip.trim())}`;
}

/** Bucket key for a signed-in sender. A user id is not a secret; stored raw
 *  (no FK) so account deletion can purge by it. */
export function actorKeyForUser(userId: string): string {
  return `u_${userId}`;
}

/** Bucket key for a session-scoped limit (S9-01). A session id is not a secret. */
export function targetKeyForSession(sessionId: string): string {
  return `s_${sessionId}`;
}

/** Bucket key for a destination address. */
export function targetKeyForEmail(email: string): string {
  return hmac("email-target", email.trim().toLowerCase());
}
