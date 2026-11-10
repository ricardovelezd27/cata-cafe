# Device checklist — native readiness (S8-15)

Run on a **physical iPhone** (ideally also an Android). Two targets:

- **A. iOS Safari standalone PWA** (Add to Home Screen) — can be run today.
- **B. Capacitor dev build** — later; nothing here installs Capacitor.

Record per row: result (pass / fail / n.a.), build id (commit sha or TestFlight build), date, notes.
Every row below is **pending**: no device was available when this was written.

**Entry contract (S8-06):** every `/app/*` redirect to login carries `?next=`, so a deep link
that needs a sign-in returns to the same screen afterwards.

E5 (do you need to create a session offline? Kim) is not answered; storage mirror and offline
create are out of scope. Row 1 is the evidence for that decision.

| # | Area | Steps | Expected | A: PWA | B: Capacitor |
|---|---|---|---|---|---|
| 1 | Storage eviction | Cup 3 samples offline (airplane), leave 3 unsynced drafts, close the app, wait 7 idle days, reopen online | Drafts still there and sync; if gone, note whether `cata_storage_persist` said `granted` / `denied` | pending | pending |
| 2 | Stale-draft warning | Same setup, after 3 days in Safari (not installed) | Dashboard shows "borradores sin sincronizar" plus the older-than-3-days notice; not shown when installed | pending | n.a. |
| 3 | Google OAuth | Login screen, Continue with Google | System browser opens, returns to the app signed in, lands on `?next=` | pending | pending (TODO(native): `skipBrowserRedirect` + `openExternal` + `appUrlOpen`) |
| 4 | In-app browser hint | Open the login link inside Instagram / WhatsApp in-app browser | Google button replaced by the hint + Copy link; email form works | pending | n.a. |
| 5 | Magic link / OTP code | Request a link, type the 6-digit code in the app | Signs in without leaving the shell | pending | pending |
| 6 | CVA PDF | Results footer, Download PDF | Opens/saves/shares; offline the button is disabled with "Necesita conexión" | pending | pending (TODO(native): Filesystem + Share) |
| 7 | Summary + ficha PDFs | Results footer, personal summary and ficha técnica (owner) | Same as row 6 | pending | pending |
| 8 | Coffee ficha PDF | Coffee profile, Descargar ficha | Same as row 6 | pending | pending |
| 9 | Users CSV (admin) | Insights, Usuarios | Web downloads; **hidden** in the shell | pending | pending |
| 10 | PNG exports | Invite QR download, insight card download | Image saved or shared | pending | pending |
| 11 | Print | Results, Ver formulario, Imprimir | Print sheet on web; in the shell print is replaced by sharing the PDF (TODO(native)) | pending | pending |
| 12 | QR join | Scan the join QR with the camera; also type the code by hand | Opens `/join/<token>`; the typed-code fallback works | pending | pending |
| 13 | Background 30 s | In cup (group), waiting room, results, then synced warm-up: background the app 30 s | On return: "sin conexión" clears within a few seconds, data refreshed, realtime delivers a new submission | pending | pending |
| 14 | Lock 10 s | Same screens, lock the phone 10 s | Same as row 13. Synced warm-up: cue offset vs the host <= 1 s (re-seek is S8-13) | pending | pending |
| 15 | Airplane toggle | Airplane on 20 s then off | Offline banner then recovery; drafts sync; no duplicate channels (check Supabase Realtime) | pending | pending |
| 16 | Deep links | Cold start and warm start from a link to `/join/<token>`, `/auth/claim?token=…`, `/app/sessions` | Lands on the right in-app screen; a foreign origin or `?next=https://evil.com` is ignored | pending | pending (TODO(native): `appUrlOpen` -> `routeFromUrl`) |
| 17 | Dialogs and layout | Delete a session, leave a group, any confirm | No `window.confirm`; safe-area insets respected; `dvh` layouts do not jump when the keyboard opens | pending | pending |

Notes for whoever runs it:

- Row 1 outcome decides how seriously to take E5.
- Screenshots (390x844 and 1280): login hint, offline report links, and the warm-up note once S8-13 lands.
