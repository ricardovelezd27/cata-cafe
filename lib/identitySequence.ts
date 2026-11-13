// Two small, pure sequencers for the identity flows (S10 leftovers C1). The
// steps are injected so the ORDER is unit-tested without a browser; the callers
// (lib/identityResolve.ts, components/join/GuestIdentityChoice.tsx) pass the real
// ones.

/**
 * The one identity reload: (1) the before-reload hooks (the cup page writes what
 * is being typed), THEN (2) the claim re-key (moves the anonymous id's drafts to
 * the account when the markers say so), THEN (3) the reload. A failure in 1 or 2
 * never blocks the reload (nothing was deleted). Never throws.
 */
export async function sequenceIdentityReload(steps: {
  beforeReload: () => Promise<void>;
  rekeyIfClaimed: () => Promise<void>;
  reload: () => void;
}): Promise<void> {
  try {
    await steps.beforeReload();
    await steps.rekeyIfClaimed();
  } catch {
    // reload anyway: nothing was deleted
  }
  steps.reload();
}

export type LeaveOutcome<E extends string = string> = { ok: true } | { ok: false; error: E | "unknown" };

/**
 * "No soy {nombre}" and sign-out: end the session on the server FIRST, and only
 * after it succeeded tell the other tabs (`announce`) and clear this device's
 * caches (`clearDevice`), in that order. A refused or thrown sign-out announces
 * nothing and clears nothing (the person is still signed in). Never throws.
 */
export async function sequenceLeaveAfterSignOut<E extends string>(steps: {
  signOut: () => Promise<{ ok: true } | { ok: false; error: E }>;
  announce: () => void;
  clearDevice: () => Promise<void>;
}): Promise<LeaveOutcome<E>> {
  let result: { ok: true } | { ok: false; error: E };
  try {
    result = await steps.signOut();
  } catch {
    return { ok: false, error: "unknown" };
  }
  if (!result.ok) return { ok: false, error: result.error };
  steps.announce();
  await steps.clearDevice();
  return { ok: true };
}
