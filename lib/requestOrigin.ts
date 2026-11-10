import "server-only";

import { headers } from "next/headers";
import { siteOrigin } from "@/lib/inviteUrl";
import { pickTrustedOrigin } from "@/lib/trustedOrigin";

/**
 * Origin to use for any link that leaves the app by email (sign-in, group
 * invitations, broadcasts, session notices). The request Origin/Host header is
 * attacker-controlled, so it is only honoured when `pickTrustedOrigin` accepts
 * it (site origin, local dev, or this deploy's own Vercel preview host);
 * otherwise the configured site origin wins.
 */
export async function trustedRequestOrigin(): Promise<string> {
  const h = await headers();
  const requestOrigin =
    h.get("origin") ||
    `${h.get("x-forwarded-proto") || "http"}://${h.get("host") || "localhost:3000"}`;
  return pickTrustedOrigin({
    requestOrigin,
    siteOrigin: siteOrigin(),
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    vercelUrls: [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL],
  });
}
