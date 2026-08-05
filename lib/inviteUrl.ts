/**
 * Builds the absolute join URL for a group-session invite token. Centralizes a
 * construction that used to be duplicated inline in NewSessionForm.tsx and
 * CupClient.tsx.
 */
export function buildInviteUrl(origin: string, locale: string, token: string): string {
  return `${origin}/${locale}/join/${token}`;
}

/**
 * Absolute join URL for a coffee-share invite token (CoffeeInvite). The static
 * `coffee` segment can never collide with a session token: those are UUIDs.
 */
export function buildCoffeeInviteUrl(origin: string, locale: string, token: string): string {
  return `${origin}/${locale}/join/coffee/${token}`;
}
