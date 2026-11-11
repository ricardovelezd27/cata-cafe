S8-06 PLANNER (checked against origin/claude/s8-03-guest-guard-email-impl, "B3")

1. BUILDABLE NOW (the spec is "Gated on Kim: none", so all 11 steps are buildable)
T1 One `safeNext(input,{origin?,fallback})` in lib/safeNext.ts. Delete `resolveNext` in app/auth/callback/route.ts. Remove `safeNextPath` from lib/trustedOrigin.ts, or have it delegate. Rewire login page, magicLink.ts and the Google action. Add tests/safeNext.test.ts. Reject `/auth/*` targets (loop risk). Closes F-entrar-7.
T2 Pure lib/authState.ts (user|none|unreachable) and `getAuthUser()` in lib/auth.ts. Replace the 14 `if(!user) redirect` page sites plus layout. `unreachable` renders ErrorPanel with retry. Tests. Closes F-entrar-2.
T3 proxy.ts: after the guest branch, `none` under /{locale}/app/** redirects to login with `next=<path+search>` via a pure helper; `unreachable` falls through; page redirects stay as backstops. Closes F-entrar-3.
T4 app/[locale]/auth/confirm/page.tsx ("Entrar" button) plus `confirmEmailToken` (run(), verifyOtp, safeNext). The callback `token_hash` branch only redirects there; the `code` branch is unchanged; failure offers a new link. Closes F-entrar-1 and F-landing-3.
T5 components/auth/EmailSentState.tsx used by LoginForm and WaitlistForm. Includes the 6-digit code input, `verifyEmailCode` (verifyOtp type email), a 60 s resend countdown seeded from `retryAfterMs`, change-email, and role=status. Closes F-entrar-1 and F-landing-4.
T6 lib/authErrors.ts plus `auth.errors.*` in es/en. The callback forwards `error`/`error_code`; a Google cancel gets neutral copy; role=alert. `sendMagicLink` returns an ActionResult-shaped error. Closes F-entrar-9 and F-landing-7.
T7 Locale: `signInWithMagicLink(formData,next,locale)` sets `options.data.preferred_lang` and defaults `next` to /{locale}/app. The callback derives the locale from `next`. `signOut(locale)`; `SignOutButton` passes it. ProfileForm relabelled "Idioma de los correos". Closes F-entrar-5 and F-cuenta-4.
T8 Pure `localeSwitchHref(pathname,search,hash,target)` over `stripLocale`, used by Sidebar and TopBar. Closes F-cuenta-3.
T9 OnboardingWrapper mounts only on exactly /app (usePathname). WelcomeModal rebuilt on ResponsiveDialog with a visible close. New `dismissOnboarding()` sets only onboardingCompleted. `mergeGuestData`'s new-account branch sets onboardingCompleted when the name carries over. Closes F-entrar-4 and F-guest-7.
T10 lib/inAppBrowser.ts; the Google button is swapped for an "open in your browser" hint. Closes F-entrar-8.
T11 lib/siteContact.ts (also used by LandingFooter). Support link in idle/sent/failed states. docs/auth/email-templates/ (3 templates plus README). Closes F-entrar-10.
Also: docs/flows.md, "Fixed in S8-06" lines in the audit files, tests (authState, authErrors, localeSwitch, safeNext).

2. GATED
No Kim gate. Owner-manual only, so leave named TODOs in the PR body and runbook, not in code:
- TODO(ricardo): paste the 3 templates in Supabase AFTER the deploy.
- TODO(ricardo): confirm OTP length is 6.
- TODO(ricardo): confirm the redirect allow-list covers /auth/confirm.
- TODO(owner): the real support address. The only one in code is hola@estudiodecafe.online (LandingFooter:33), so T11 can reuse it.
- Do not pin the OTP expiry text to a number. Say "pronto" or read a constant that Ricardo confirms.

3. FACTS FOR THE ARCHITECT
- There are now THREE `next` validators, not two. Batch 1 added `safeNextPath` (lib/trustedOrigin.ts:61, used by lib/magicLink.ts:50) beside `safeNext` and the callback's `resolveNext`. T1 must absorb all three. `safeNextPath` accepts `/auth/...`, "\\"-free control chars, and has no origin handling.
- "Use it in lib/guestClaim.ts" is stale. That file only has `safeClaimBack` (startsWith `/{loc}/app/`), which is stricter, and the claim page and actions/guestClaim.ts build `next` themselves. Leave `safeClaimBack`. Only pipe the final `next` through `safeNext` in the callback.
- The spec's "auth.ts:17-19" and "42,57" line cites are stale. Sign-in is now in lib/magicLink.ts (S8-03), and `getOrigin` was replaced by lib/requestOrigin.ts. `signInWithGoogle` still uses a local `getOrigin()` (auth.ts:8) and still trusts the Origin header. Switch it to `trustedRequestOrigin`.
- Partly done by batch 1: `sendMagicLink` returns `{ok:false,error,retryAfterMs}` and shares the rate-limit mapping with the waitlist (F-landing-7 is mostly the duplicated string-matching now). The login form ignores `retryAfterMs`, so T5 can drive the countdown from it. `rate_limited` is already in ActionErrorCode and `errors.codes`.
- No SQL is needed for T7. `handle_new_user()` already reads `raw_user_meta_data->>'preferred_lang'` (rls_and_triggers.sql:73 and :936). It only applies when the user is first created, so add a comment saying so.
- The waitlist passes `next` as `/app` for es and `/en/app` for en (waitlist.ts), while the default in magicLink is `/es/app`. T7 should pass the locale and drop that ternary.
- The proxy matcher excludes `auth/callback` but not `auth/confirm`. The confirm page is under [locale], so the Supabase template needs a locale-aware link (`/{{ .Data.preferred_lang }}/auth/confirm`) or it must rely on the intl default. Pick one in the README. The callback keeps redirecting old-template links.
- Guest-claim chain: `confirmGuestClaim` and the claim page do their own `getUser` plus login redirect with `intent=claim`. T2 must leave anonymous users as "user" and not break this.
- Two designs for T3, and a decision for the architect. (a) Redirect in the proxy only. (b) Keep per-page redirects and add `next` to each. The spec chose (a) plus backstops; the backstops still need `next` or the proxy-miss case (unreachable) drops it.
- F-entrar-2 detection: treat AuthSessionMissing as none and AuthRetryableFetchError or status>=500 as unreachable. In the proxy, `getUser` is already in a try/catch, so unreachable falls through correctly.
- Runbook: sections 10 and 11 exist on B3 (§10 may belong to S8-01 and was not in the grep), so the template section here should be §12. Re-check at merge.
- The modal also shows for guests (layout.tsx:41 has no guest check). T9's /app-only mount mostly fixes this.

4. FILES TOUCHED
lib/safeNext.ts, lib/trustedOrigin.ts, lib/magicLink.ts, lib/auth.ts, lib/authState.ts (new), lib/authErrors.ts (new), lib/inAppBrowser.ts (new), lib/localeSwitch.ts (new), lib/siteContact.ts (new), lib/guestClaim.ts (onboardingCompleted only), proxy.ts, app/auth/callback/route.ts, app/actions/auth.ts, app/actions/profile.ts, app/actions/waitlist.ts, app/[locale]/auth/confirm/page.tsx (new), app/[locale]/auth/login/{page,LoginForm}.tsx, the 14 app page files plus app/[locale]/app/layout.tsx, components/auth/EmailSentState.tsx (new), components/landing/{WaitlistForm,LandingFooter}.tsx, components/layout/{Sidebar,TopBar,SignOutButton}.tsx, components/onboarding/{OnboardingWrapper,WelcomeModal}.tsx, app/[locale]/app/profile/ProfileForm.tsx, messages/es.json, messages/en.json, tests/{safeNext,authState,authErrors,localeSwitch}.test.ts, docs/flows.md, docs/LAUNCH-RUNBOOK.md, docs/auth/email-templates/*, audit files.
Prisma migration: no. SQL phase: no. Runbook section: yes (§12, templates and OTP setting).

5. SIZE
M (heavy on i18n, tests and touch points; the logic is small). Worth one PR, with nothing gated. Run the T1 to T3 and T8 to T11 tasks in parallel with Haiku and Sonnet. Keep T1, T3, T4 and the callback with the lead.