# S8-06 — Auth: deep links, code, locale

> **When:** after S8-03 (owns the send throttle and origin fix) · before S8-07 (reuses the confirm page) · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** paste three email templates in Supabase (§6)
> **Findings:** 15 (0 P1 · 7 P2 · 8 P3) from `docs/audits/flows-2026-11/01-entrar.md`, `18-landing.md`, `02-cuenta.md`, `03-invitado-qr-claim.md` · **Gated on Kim:** none

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read the audit files it names, finding by finding: every change
you make must map to a finding id and respect that audit's "Keep — works well" list. Theme: a signed-out
person who opens any link lands on it after login, in their language, and a mail scanner can never burn
the token. Invariants: guest claim is login-then-confirm, never a merge on GET; the guest branch stays
first in proxy.ts; ActionResult contract. Out of scope: send throttles and Origin fix (S8-03), account
deletion and sign-out scope (S8-07), native OAuth bridge (S8-15). Haiku: i18n and templates; Sonnet:
components; the lead keeps safeNext, proxy redirect, confirm page, callback. Work the plan in order, one commit per step, `npx tsc --noEmit && npm run lint && npm test` before
each commit, update docs/flows.md in the same PR, and finish with the Definition of done checklist in the
PR description. Forbid bare `git stash`.
```

## 2. Findings covered

| Id | Severity (final) | Verdict | One line | Audit file |
|---|---|---|---|---|
| F-entrar-1 | P2 | PLAUSIBLE | No code, no resend; bare GET consumes token (`route.ts:42-43`) | `01-entrar.md` |
| F-landing-3 | P2 | PLAUSIBLE | Same GET defect from the landing; fixed once here | `18-landing.md` |
| F-entrar-3 | P2 | CONFIRMED | 14 guard redirects drop `next` (`layout.tsx:30`) | `01-entrar.md` |
| F-entrar-4 | P2 | CONFIRMED | Modal covers deep links, no close, skip stamps role (`WelcomeModal.tsx:71-75`) | `01-entrar.md` |
| F-entrar-5 | P2 | CONFIRMED | `/es/app` hardcoded, no `preferred_lang` (`auth.ts:42,57`) | `01-entrar.md` |
| F-cuenta-4 | P2 | CONFIRMED | Language never captured; field misleads (`profile.ts:119`) | `02-cuenta.md` |
| F-cuenta-3 | P2 | CONFIRMED | ES/EN link no-op on Spanish routes (`Sidebar.tsx:22`, `TopBar.tsx:16`) | `02-cuenta.md` |
| F-guest-7 | P3 | CONFIRMED | Modal replaces the post-claim destination | `03-invitado-qr-claim.md` |
| F-entrar-2 | P3 | PLAUSIBLE | Transient auth failure treated as signed out | `01-entrar.md` |
| F-entrar-7 | P3 | CONFIRMED | Two `next` validators plus raw concat (`auth.ts:17-19`) | `01-entrar.md` |
| F-entrar-8 | P3 | new | Google dead in in-app browsers | `01-entrar.md` |
| F-entrar-9 | P3 | CONFIRMED | Errors unannounced; Google cancel reads "caducado" | `01-entrar.md` |
| F-entrar-10 | P3 | CONFIRMED | No support exit; templates unversioned | `01-entrar.md` |
| F-landing-4 | P3 (was P2) | CONFIRMED | Waitlist success: no address/resend (`WaitlistForm.tsx:53-60`) | `18-landing.md` |
| F-landing-7 | P3 | new | Landing and login map different rate-limit codes | `18-landing.md` |

## 3. Gated on Kim

None.

## 4. Plan

1. **One `safeNext`** — `lib/safeNext.ts` becomes `safeNext(input, { origin?, fallback })`: path or absolute same-origin URL (the template sends `{{ .RedirectTo }}` absolute); rejects `//x`, `/\x`, `@`, userinfo, control and encoded-slash forms; returns path+search+hash. Delete `resolveNext`; use it in `proxy.ts`, both auth actions, login page and `lib/guestClaim.ts`. `tests/safeNext.test.ts`. Covers: F-entrar-7.
2. **Auth-state classifier** — pure `lib/authState.ts` (`user | none | unreachable`; session-missing = none, fetch/5xx = unreachable) plus `getAuthUser()` in `lib/auth.ts`; replace the 14 sites; `unreachable` shows `ErrorPanel` retry, never login. Authz still via `lib/sessionAuth.ts`. Covers: F-entrar-2.
3. **Proxy redirect** — after the guest branch, `none` under `/{locale}/app/**` redirects to login with `next=<path+search>` via step 1 (pure, tested helper); `unreachable` falls through; page redirects stay as backstops. Covers: F-entrar-3.
4. **`/auth/confirm`** — `app/[locale]/auth/confirm/page.tsx` with an "Entrar" button; `confirmEmailToken(token_hash, type, next)` (`run()`) calls `verifyOtp` and lands on `safeNext`. Types: email, magiclink, signup, email_change, recovery. The callback's `token_hash` branch only redirects here, so mails already sent survive; the Google `code` branch is unchanged; failure offers a new link. Claim chain keeps working. Covers: F-entrar-1, F-landing-3.
5. **Sent state with code** — shared `components/auth/EmailSentState.tsx` for `LoginForm` and `WaitlistForm`: address, "enlace o código", expiry in words, one input (`inputmode=numeric`, `autocomplete=one-time-code`, `pattern=\d{6}`), `verifyEmailCode` → `verifyOtp({ email, token, type: 'email' })`, 60 s resend countdown, "Cambiar correo" keeps the value, support link, `role=status`, focus on heading. Covers: F-entrar-1, F-landing-4.
6. **One error map** — `lib/authErrors.ts` maps Supabase codes to `auth.errors.*`; callback forwards `error`/`error_code`; cancel gets neutral copy; `role=alert` plus `aria-describedby`; used by login and `reserveFoundingSeat`; `signInWithMagicLink` returns `ActionResult`. Covers: F-entrar-9, F-landing-7.
7. **Locale** — `signInWithMagicLink(formData, next, locale)` sets `options.data.preferred_lang` (new users only; comment it), default `next` `/{locale}/app`; callback derives locale from `next`; `signOut(locale)` lands on `/` or `/en`; `ProfileForm` relabels the field "Idioma de los correos". Covers: F-entrar-5, F-cuenta-4.
8. **Language switch** — tested `localeSwitchHref(pathname, search, hash, target)` over `stripLocale`, used by `Sidebar.tsx` and `TopBar.tsx` via router. Covers: F-cuenta-3.
9. **WelcomeModal** — `OnboardingWrapper` uses `usePathname()` and mounts only on `/app` itself, never on `/app/sessions/[id]/*`; rebuild on `ResponsiveDialog` with visible close on every step; close calls new `dismissOnboarding()` setting only `onboardingCompleted`; `mergeGuestData`'s new-account branch sets it when the name carried over. Covers: F-entrar-4, F-guest-7.
10. **In-app browsers** — `lib/inAppBrowser.ts` (only UA sniffer) swaps the Google button for an "ábrelo en tu navegador" hint. Covers: F-entrar-8.
11. **Support and templates** — `lib/siteContact.ts` (also used by `LandingFooter.tsx`), link in idle, sent, failed states; `docs/auth/email-templates/` (magic link, confirm signup, change email: link to `/auth/confirm` plus `{{ .Token }}`, branch on `.Data.preferred_lang`) with README and a runbook section. Covers: F-entrar-10.

## 5. Acceptance (tests to write or checks to run)

- F-entrar-1 / F-landing-3: a GET of the confirm URL or the old callback URL leaves the token valid; the code signs in after the link was prefetched; wrong code keeps the field editable.
- F-entrar-3: signed out, open results, log in, land there; `en` works; `//host` dropped.
- F-entrar-5 / F-cuenta-4: signup from `/en/auth/login` gives `/en/app` and `preferredLang=en`; sign-out lands on `/en`.
- F-cuenta-3: `/app/profile` to EN opens `/en/app/profile`.
- F-entrar-4 / F-guest-7: invitee sees the session unobstructed; closing sets no role; new-email claim lands on results with no modal.
- F-entrar-2/7/8/9/10, F-landing-4/7: retry panel (not login) with the auth endpoint blocked; `safeNext` rejects `//x`, `/\x`, `@x`, encoded forms; hint under an Instagram UA; errors announced once; resend disabled 60 s.

## 6. Manual steps for Ricardo

- After the deploy, paste the repo templates in Supabase (Magic Link, Confirm signup, Change Email); confirm OTP length 6 and that the redirect allow-list covers `/auth/confirm`.

## 7. Risks and rollback

- Templates swapped before the deploy break login: deploy first; rollback restores the old templates.
- Redirect loops: step 1 rejects `/auth/*` targets.

## 8. Native-readiness clause

The code path completes inside the WebView; the confirm page works from the system browser; a universal-link cold start reaches the same `next`; the modal has a focus trap and Android back.

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (`safeNext`, `authState`, `authErrors`, `localeSwitch` tests)
- [ ] docs/flows.md updated; audit file(s) get a line `Fixed in S8-06 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for login, sent state, confirm page, modal
- [ ] gated items either done or left as named TODOs listed in the PR description
