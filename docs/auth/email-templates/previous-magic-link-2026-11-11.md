# Magic link template in Supabase before 2026-11-11

Subject: `Inicia sesion /Sign In a Cata Cafe Sensible`

The template that was live before the 6-digit code was added. The only change made on
2026-11-11 was inserting, right after each of the two `</a>` buttons, these two paragraphs
(Spanish label under the first button, English under the second):

```html
<p style="font-size: 13px; line-height: 1.5; color: #5C4A32; margin: 24px 0 8px 0;">O escribe este código en la pantalla de acceso:</p>
<p style="font-family: 'Lato', 'Segoe UI', sans-serif; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #3D5A3E; margin: 0;">{{ .Token }}</p>
```

Rollback: delete those two paragraphs in both places. Everything else (branded header,
`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`
buttons, footer) is unchanged.
