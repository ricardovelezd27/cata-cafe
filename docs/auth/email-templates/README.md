# Supabase email templates (S8-06)

The three sign-in emails live here so they are versioned with the code that reads them.
Supabase keeps its own copy: **pasting them is a manual step** (runbook §15).

| File | Supabase template | `type` in the link |
|---|---|---|
| `magic-link.html` | Magic Link | `email` |
| `confirm-signup.html` | Confirm signup | `signup` |
| `change-email.html` | Change Email Address | `email_change` |

## Live state (2026-11-12)

The three `.html` files in this folder are **byte-for-byte what is saved in Supabase**
(checked by SHA-256 in the dashboard on 2026-11-12):

| File | Subject in Supabase | SHA-256 (first 12) |
|---|---|---|
| `magic-link.html` | `Inicia sesion /Sign In a Cata Cafe Sensible` | `26a348edc007` |
| `confirm-signup.html` | `Confirma tu cuenta / Confirm your account · Cata Café Sensible` | `1901469fb7fd` |
| `change-email.html` | `Confirma tu nuevo correo / Confirm your new email · Cata Café Sensible` | `a50c777b6d0b` |

They are Ricardo's branded design, with Spanish and English in the same email (two
blocks, two buttons), so they do not use `.Data.preferred_lang`. The magic link and the
signup email link to `/auth/callback?token_hash=…&type=email`, which only redirects to
`/auth/confirm` (never verifies on GET); the change-email link goes to `/auth/confirm`
directly with `type=email_change`. The sections below describe the earlier generic
versions of these files and the reasoning behind `/auth/confirm`; the link shapes above
are the ones in use. Rollback texts: `previous-magic-link-2026-11-11.md`,
`previous-templates-2026-11-12.md`.

## What changed from the old template

The old link went to `/auth/callback?token_hash=…`, whose GET consumed the one-time token. A
mail scanner or link previewer that opens every URL could burn it before the person did.
Now the link goes to **`/auth/confirm`**, a page with an "Entrar" button; only the button's
POST (`confirmEmailToken`) calls `verifyOtp`. The email also carries `{{ .Token }}`, the
6-digit code the login screen accepts (`verifyEmailCode`).

## Variables used

- `{{ .TokenHash }}` and `{{ .Token }}` — link token and 6-digit code.
- `{{ .RedirectTo }}` — absolute URL of the final destination (`emailRedirectTo` from
  `lib/magicLink.ts`). `/auth/confirm` validates it with `safeNext` (same origin only).
- `{{ .Data.preferred_lang }}` — user metadata set at sign-up (`options.data.preferred_lang`).
  English users get the body in English and a link to `/en/auth/confirm`. **If the field is
  missing (older accounts, or a template render without `.Data`) the Spanish, unprefixed
  `/auth/confirm` is used** — the default locale, because `localePrefix` is `as-needed`.
  Supabase accepts one subject per template, so the subjects in the file headers are bilingual.

## Compatibility

Emails already sent with the old template still work: `/auth/callback` keeps accepting
`token_hash` links but only **redirects** to `/auth/confirm` (it no longer verifies on GET).
The Google `code` exchange in the callback is unchanged.

## Checks before pasting

1. Authentication → Sign In / Providers → Email: **OTP length = 6**.
2. Authentication → URL Configuration: the redirect allow-list must include the site origin
   (`https://cafesensible.ai/**`), which already covers `/auth/confirm` and `/en/auth/confirm`.
3. Deploy first, paste after. Pasting before the deploy sends links to a page that does not exist.
