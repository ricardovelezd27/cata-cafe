// The ONE support / contact address (S8-06, F-entrar-10). Landing footer, the
// login screens and the legal pages read it from here. TODO(owner): confirm
// this is the address people should write to when sign-in fails.
export const SUPPORT_EMAIL = "hola@estudiodecafe.online";

export function supportMailto(subject?: string): string {
  return subject
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
    : `mailto:${SUPPORT_EMAIL}`;
}
