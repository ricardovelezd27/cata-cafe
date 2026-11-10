# Supabase email templates (S8-06)

The three sign-in emails live here so they are versioned with the code that reads them.
Supabase keeps its own copy: **pasting them is a manual step** (runbook §15).

| File | Supabase template | `type` in the link |
|---|---|---|
| `magic-link.html` | Magic Link | `email` |
| `confirm-signup.html` | Confirm signup | `signup` |
| `change-email.html` | Change Email Address | `email_change` |

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
