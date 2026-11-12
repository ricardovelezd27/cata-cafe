# Templates in Supabase before 2026-11-12 (rollback)

On 2026-11-12 "Confirm sign up" and "Change email address" were replaced by the branded
bilingual design of the magic link (`confirm-signup.html`, `change-email.html` in this
folder). Links were NOT changed. To roll back, paste the old subject and body below.

## Confirm sign up

Subject: `Confirm Your Signup`

```html
<h2>Confirm your signup</h2>

<p>Follow this link to confirm your user:</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}">Confirm your mail</a></p>
<p>O escribe este código en la pantalla de acceso / Or type this code on the sign-in screen:</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">{{ .Token }}</p>
```

## Change email address

Subject: `Confirm Email Change`

```html
<h2>Confirm Change of Email</h2>

<p>Follow this link to confirm the update of your email from {{ .Email }} to {{ .NewEmail }}:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next={{ .RedirectTo }}">Change Email</a></p>
```
