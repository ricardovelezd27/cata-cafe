import "server-only";

import { createHmac } from "node:crypto";
import { assignCsvCodes } from "@/lib/reports/csvCodes";

// Keyed half of the results-CSV codes (S10 WP5a, H1). Same secret the analytics
// "Catador XXXX" label and the email ledger use, under its OWN domain prefix
// that includes the session id, so a code is never equal to any other key.

function secret(): string {
  const s = process.env.GUEST_CLAIM_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("guest_claim_secret_missing");
  return s;
}

/** cupper id -> code for one session (the same cupper gets a different code in another session). */
export function csvCupperCodes(sessionId: string, cupperIds: string[]): Map<string, string> {
  const key = secret();
  const digests = new Map(
    [...new Set(cupperIds)].map((id) => [
      id,
      createHmac("sha256", key).update(`results-csv:${sessionId}:${id}`).digest("hex"),
    ]),
  );
  return assignCsvCodes(digests);
}
