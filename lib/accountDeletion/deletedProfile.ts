// The placeholder a deleted account leaves behind (S8-19, F-cuenta-1).
//
// deleteAccount does NOT use one shared tombstone: Evaluation is unique on
// [sessionSampleId, cupperId] and SessionParticipant on [sessionId, userId], so
// two deleted users who rated the same sample would collide on a single row.
// Each deletion instead creates ITS OWN profile with id `deleted_<random>`
// (plain String id, no auth user behind it: it can never sign in and has no
// email to receive). The rows the person left in other people's sessions,
// groups and coffees point at it.
//
// The stored displayName is a neutral Spanish fallback (the default locale) so
// any site that only selects `displayName` still shows something sensible.
// Sites that know the id render the localized label through
// `profileDisplayName`.
//
// Pure module (no Prisma, no server-only): imported by tests and by client
// components alike.

export const DELETED_PROFILE_PREFIX = "deleted_";

/** What deleteAccount stores in profiles.displayName for the placeholder. */
export const DELETED_PROFILE_STORED_NAME = "Cuenta eliminada";

export const DELETED_PROFILE_LABEL: Record<"es" | "en", string> = {
  es: "Cuenta eliminada",
  en: "Deleted account",
};

export function isDeletedProfileId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(DELETED_PROFILE_PREFIX);
}

export function deletedProfileLabel(locale: string): string {
  return locale === "en" ? DELETED_PROFILE_LABEL.en : DELETED_PROFILE_LABEL.es;
}

/** `deleted_<random>`. The random part comes from the caller (crypto in the
 *  server) so this module stays pure and testable. */
export function deletedProfileId(random: string): string {
  const clean = random.replace(/[^A-Za-z0-9]/g, "");
  if (clean.length < 16) throw new Error("invalid_input");
  return `${DELETED_PROFILE_PREFIX}${clean}`;
}

/** The name to show for a profile: the localized "Cuenta eliminada" for a
 *  deletion placeholder, the stored name otherwise. */
export function profileDisplayName(
  profile: { id: string; displayName: string } | null | undefined,
  locale: string,
  fallback = "",
): string {
  if (!profile) return fallback;
  if (isDeletedProfileId(profile.id)) return deletedProfileLabel(locale);
  return profile.displayName || fallback;
}
