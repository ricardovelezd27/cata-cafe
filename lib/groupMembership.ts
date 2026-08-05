import { prisma } from "@/lib/prisma";

// Lazily claim email-only TastingGroupMember rows for a signed-in user.
//
// The handle_new_user DB trigger links rows by email at signup, but a user who
// ALREADY had an account when a maestro added them by email never fires it —
// their row would stay unlinked forever and every members.some({ userId })
// visibility check (group detail, groups list, profile) would miss the group.
// Calling this on each groups surface closes that gap on their next visit.
export async function claimGroupMembershipsByEmail(
  userId: string,
  email: string | null | undefined,
): Promise<void> {
  if (!email) return;
  try {
    await prisma.tastingGroupMember.updateMany({
      where: { userId: null, email: email.toLowerCase() },
      data: { userId },
    });
  } catch {
    // Best-effort — a failed claim must never block a page render.
  }
}
