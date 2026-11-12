// Pure rule behind the optional `expectedUserId` of the offline replay actions
// (S10 WP8, M4). A draft is keyed by the user who wrote it; if the cookie holds
// someone else when the replay arrives (another tab signed A out and B joined),
// the server must write nothing. Absent = legacy callers, today's behaviour.

export function replayUserMismatch(expectedUserId: string | undefined, currentUserId: string): boolean {
  return expectedUserId !== undefined && expectedUserId !== currentUserId;
}
