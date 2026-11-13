import type { Prisma } from "@/app/generated/prisma/client";

// S10 WP5b review (round 3): THE lock order for everything that touches a
// session's reference.
//
//   1. the session row  (this helper, exclusive for a writer of the reference)
//   2. sample rows      (referenceRank updates, deletes, FK key-share of an evaluation insert)
//   3. evaluation rows / aggregate rows
//
// A cupper's pinned save takes the session row FOR SHARE first
// (lib/evaluationPinWrite.ts) and then the sample row's key-share lock; a
// reference change that updated `referenceRank` (a FOR UPDATE on the sample row)
// BEFORE the session row would wait on the cupper while the cupper waits on it:
// Postgres aborts one with 40P01. So every transaction that changes
// `referenceSampleId` or `referenceRank` or deletes a sample takes the session row
// FIRST, exclusively. (Transactions that create the session and its samples in one
// go need nothing: nobody else can see the rows yet.)
export async function lockSessionRow(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  sessionId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM cupping_sessions WHERE id = ${sessionId} FOR UPDATE`;
}
