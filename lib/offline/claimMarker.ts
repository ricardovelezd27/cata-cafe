// localStorage key holding the ANONYMOUS user id while a guest claim is in
// flight (S8-09, F-guest-5). Written by hooks/useGuestClaim.ts when the claim
// starts; read by UnsyncedGuardProvider on the next app mount, once the
// signed-in id differs from it, to re-key the guest's offline drafts.
// confirmGuestClaim ends in a server redirect(), so the client never runs code
// after the merge: the marker is the only way to finish the hand-over.
export const CLAIM_ANON_KEY = "cata_claim_anon";
