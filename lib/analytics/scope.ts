// One place that decides what an analytics caller may see (S8-08, F-insights-1).
// Pure and dependency-free so it is unit-tested; the access shape is
// structural so this file never imports server-only modules.
//
// Rule: ONLY the super-admin sees platform-wide data. Everyone else (AI
// admins, flagged users) sees their own footprint. To give AI admins the
// platform view again, change the one line below.

import type { AnalyticsScope } from "./types";

export type ScopeAccess = { userId: string; isSuperAdmin: boolean };

export function scopeFor(access: ScopeAccess): AnalyticsScope {
  return access.isSuperAdmin
    ? { kind: "platform" }
    : { kind: "user", userId: access.userId };
}

// TODO(D4): Kim to confirm (a: session owner sees names, b: admins see names,
// c: admins anonymous with groups under 3 suppressed). Built: (c) in platform
// scope; names only for the owner's own sessions in user scope.
export const MIN_GROUP_SIZE_PLATFORM = 3;
export const ANONYMOUS_CUPPER_PREFIX = "Catador";
