// One place that decides what an analytics caller may see (S8-08, F-insights-1).
// Pure and dependency-free so it is unit-tested; the access shape is
// structural so this file never imports server-only modules.
//
// Rule: ONLY the super-admin sees platform-wide data. Everyone else (AI
// admins, flagged users) sees their own footprint. To give AI admins the
// platform view again, change the one line below.

import type { AnalyticsScope } from "./types";
import { maskEmail } from "../maskEmail";

export type ScopeAccess = { userId: string; isSuperAdmin: boolean };

export function scopeFor(access: ScopeAccess): AnalyticsScope {
  return access.isSuperAdmin
    ? { kind: "platform" }
    : { kind: "user", userId: access.userId };
}

// Platform scope (super-admin only): cuppers are pseudonymous ("Catador XXXX"),
// and a cupper with fewer than MIN_GROUP_SIZE_PLATFORM evaluations in the whole
// scope is dropped from the `cupper` dimension. User scope shows names only for
// the caller and the cuppers of sessions they own.
export const MIN_GROUP_SIZE_PLATFORM = 3;
export const ANONYMOUS_CUPPER_PREFIX = "Catador";

/**
 * What the Users directory may carry for one address (S8-08 review). Masking is
 * decided on the SERVER so a non-super-admin payload never holds the raw
 * address: super-admin gets it raw; AI admins and flagged users get only the
 * masked form.
 */
export function directoryEmail(email: string | null, isSuperAdmin: boolean): string | null {
  if (!email) return null;
  return isSuperAdmin ? email : maskEmail(email);
}
