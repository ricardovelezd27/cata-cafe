// Pure rule for the cup page's foreground-resume callback (S10 WP9b).
//
// On resume the callback bumps `resumeKey`, which rebuilds the realtime channel;
// for the OWNER of an online group session that channel's SUBSCRIBED callback
// already calls router.refresh() (it also re-seeds events missed while the
// socket was down), so the callback itself must not refresh a second time.
// Everyone else (non-owners, and the owner while offline, when the realtime
// effect returns early) relies on the callback's own refresh.
export function resumeCallbackRefreshes(args: {
  isGroup: boolean;
  isOwner: boolean;
  online: boolean;
}): boolean {
  if (!args.isGroup) return false; // solo: nothing to refetch (caller returns first)
  return !(args.isOwner && args.online);
}
