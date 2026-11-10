// Locale values reach redirect()/revalidatePath() paths from client input.
// Only the app's own locales may through (S8-10 T1): `//evil.test` or
// `../x` would otherwise build a protocol-relative redirect.

export const APP_LOCALES = ["es", "en"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export function safeLocale(raw: unknown): AppLocale {
  return raw === "en" ? "en" : "es";
}
