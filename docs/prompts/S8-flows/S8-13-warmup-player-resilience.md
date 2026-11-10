# S8-13 — Warm-up player survives locks, calls, taps

> **When:** after S8-11 (shares the waiting room and `serverNow` resume work); independent of S8-12 · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** nothing to apply (no migration, no SQL); answers F1–F5 can land later, defaults are built.
> **Findings:** 7 (0 P1 · 2 P2 · 5 P3) from `docs/audits/flows-2026-11/16-movimiento-sensorial.md` · **Gated on Kim:** F1, F2, F3, F4, F5 (all have a default; build the default, keep the switch trivial)

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read docs/audits/flows-2026-11/16-movimiento-sensorial.md, finding
by finding (incl. §4 "Keep" and §7): every change you make must map to a finding id and respect the Keep list.
Theme: the Movimiento Sensorial player and its gate must behave when the phone locks, a call arrives, a thumb
slips, or the cupping has already started. Invariants in play: ONE clock (hooks/useRunClock.ts +
lib/warmup/runClock.ts — never add a second clock, CSS keyframe timer or per-phase countdown), all synced
math lives in lib/warmup/syncedRun.ts, the gate stays pure (lib/warmup/overlayGate.ts), `warmupStartedAt`
is never read by scoring, audio unlock stays inside the Empezar gesture. Out of scope: new exercises, a
short version, movement substitutions, the offline-rebuilt /cup (S8-09). Delegation: Sonnet may do copy edits
(steps 6-7) and the gate tests (step 1); the lead keeps steps 2-4. Work the plan in
order, one commit per step, `npx tsc --noEmit && npm run lint && npm test` before each commit, update
docs/flows.md in the same PR, and finish with the Definition of done checklist in the PR description. Forbid
bare `git stash`.
```

## 2. Findings covered

| Id | Severity (final) | Verdict | One line | Audit file |
|---|---|---|---|---|
| F-movimiento-sensorial-1 | P2 | CONFIRMED | `/cup` can open the 3–7 min interstitial after "Iniciar cata" (`lib/warmup/overlayGate.ts:30-36`, `CupClient.tsx:2322`) | `16-movimiento-sensorial.md` |
| F-movimiento-sensorial-3 | P2 | PLAUSIBLE | After lock/call the clock resumes while the AudioContext may stay `suspended`; cues silent (`hooks/useWarmupAudio.ts:92-94,242`, `WarmupPlayer.tsx:400-402`) | same |
| F-movimiento-sensorial-2 | P3 | PLAUSIBLE | Synced run: wake-lock denial never shown, no re-seek after sleep (`WarmupPlayer.tsx:88,97,109-114,1026`) | same |
| F-movimiento-sensorial-5 | P3 | CONFIRMED | Reflections saved without user id, unreadable, survive sign-out (`lib/warmup/reflections.ts:5,18-31`, `lib/offline/deviceState.ts:33-39`) | same |
| F-movimiento-sensorial-6 | P3 | inferred | Dusk mode hides pause (`WarmupPlayer.module.css:208`); a stray exit marks seen permanently | same |
| F-movimiento-sensorial-7 | P3 | CONFIRMED | Copy promises sensory acuity (`messages/es.json` `warmup.dashboard.body`, `warmup.player.doneBody`, `lib/warmup/exercises.ts:220`) | same |
| F-movimiento-sensorial-8 | P3 | CONFIRMED | `invalid_warmup` has no copy (`app/actions/sessions.ts:227-229,970`; `new/page.tsx:100-109`; `NewSessionForm.tsx:530-531`) | same |

F-movimiento-sensorial-4 (offline-rebuilt /cup) belongs to S8-09. `WarmupMoment` is `components/session-moments/WarmupMoment.tsx`.

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|
| F1 | When is the movement done: only before the water, always, or "later"? | (a) only before the water; afterwards a discreet optional entry | Build (a): no auto-overlay once a live session has started |
| F2 | Can each cupper re-read the two end answers? | (b) do not save | Stop persisting, drop the "Guardado" line, purge legacy keys |
| F3 | Promise "asentarte y concentrarte" or "despertar los sentidos"? | (a) calm and focus | Reword to settling/ritual, es and en together |
| F4 | On interruption: resume, repeat step, leave? Short version? | resume; short version yes | Resume = today's pause/resume. Short version NOT built here |
| F5 | Group: all at once or each free? Substitutable movements? | (a) all at once, skippable silently; substitution yes | Keep the synced run as is; skipping stays silent for others. Substitutions NOT built here |

## 4. Plan

1. **Gate learns `startedAt`** — add `startedAt: boolean` to `OverlayGateInput`; new row before the final `true`: live group (`isGroup && !isAsync`) with `startedAt` returns `false` (participants and late joiners alike). Solo and async keep today's behaviour. `WarmupMoment` takes `startedAt`; `CupClient` passes its existing `startedAt` state (`CupClient.tsx:405`); the decision stays frozen at mount. Files: `lib/warmup/overlayGate.ts`, `components/session-moments/WarmupMoment.tsx`, `CupClient.tsx`, `tests/warmup-overlayGate.test.ts`. Invariant: gate pure and frozen at mount. Covers: F-movimiento-sensorial-1.
2. **Audio resume that cannot be silent** — add a pure `audioResumeDecision({ ctxState, muted, running, interrupted })` in `lib/warmup/audioResume.ts` returning `ok | prompt`. `useWarmupAudio` exposes `suspended`; after hidden→visible or an `interrupted` clear, if the context is not `running` and not muted, the player pauses the clock and shows "Toca para reanudar"; the tap (a gesture) resumes the context, re-runs `audio.schedule` from the current position and plays. Never shown when muted. Files: `hooks/useWarmupAudio.ts`, `WarmupPlayer.tsx`, `lib/warmup/audioResume.ts`, `tests/warmup-audioResume.test.ts`. Invariant: one clock (pause/seek only); unlock stays in Empezar. Covers: F-movimiento-sensorial-3.
3. **Synced run: wake lock visible, re-seek on return** — in `synced` mode show a small persistent state during the run when `wake.denied` (`hooks/useWakeLock.ts:215`), not only on the intro panel. On `visibilitychange` to visible (and `pageshow`) recompute the position from `warmupStartedAt` + skew with `seekFor`/`isMissed` in `lib/warmup/syncedRun.ts`, then `clock.seek`; under 20 s remaining takes the existing missed path. The caller (`CupClient`, `WaitingRoomClient`) passes a `resyncPositionMs()` callback so the player holds no schedule math; only seek when drift exceeds ~1.5 s. Library and session modes unchanged. Files: `WarmupPlayer.tsx`, `lib/warmup/syncedRun.ts`, `tests/warmup-syncedRun.test.ts`, callers. Invariant: single clock; `warmupStartedAt` never reaches scoring. Covers: F-movimiento-sensorial-2.
4. **Pause reachable in dusk, skip confirmed** — in eyes-closed mode the first tap on the stage or the hidden footer is a pause with a short haptic and visible feedback, not a reveal. A skip before 20 s of run does not mark the moment seen; a later skip asks a one-tap confirm. The player's `onExit` payload gains `{ completed, elapsedMs }`; `WarmupMoment` and `WaitingRoomClient` (`:189-199`) call `markMomentSeen` only when `completed` or past 20 s. Files: `WarmupPlayer.tsx`, `WarmupPlayer.module.css`, `WarmupMoment.tsx`, `WaitingRoomClient.tsx`. Invariant: `onExit` stays the single exit; the player owns Escape. Covers: F-movimiento-sensorial-6.
5. **Reflections per F2 default (b)** — stop writing: remove `saveReflection` from the reflect step (keep the two prompts as a quiet pause) and drop `warmup.reflect.savedNote`; `clearLocalDeviceState` also deletes legacy `cata_warmup_reflections_*` keys. If Kim answers (a): key by user id, show on the exercise page, clear on sign-out. Files: `lib/warmup/reflections.ts`, `WarmupPlayer.tsx`, `lib/offline/deviceState.ts`, `messages/*.json`. Covers: F-movimiento-sensorial-5.
6. **Copy per F3 default (a)** — reword the three strings to settling and ritual ("para asentarte antes de catar"); es and en in one commit. Covers: F-movimiento-sensorial-7.
7. **`invalid_warmup` copy** — add `session.newForm.errors.invalid_warmup` in es/en and map it in the wizard (`new/page.tsx:100-109`) and the edit form. If S8-10 already passes the whole `errors` object, only the key is needed. Covers: F-movimiento-sensorial-8.

## 5. Acceptance (tests to write or checks to run)

- F-1: `warmup-overlayGate.test.ts` rows: live group + `startedAt` gives false for participant and late joiner; async and solo unchanged; before start an async participant still gets the overlay; after start the samples show at once.
- F-3: `warmup-audioResume.test.ts` truth table; device check: background 15 s mid-leg, return — sound runs on the beat or the player is paused with the prompt; never in muted mode.
- F-2: a synced follower with wake lock unsupported sees the note; lock 10 s, unlock, within ~1 s of the host; library/session unchanged.
- F-6: one tap in a dusk leg pauses; exit within 20 s leaves the exercise unseen.
- F-5: two users on one device never share notes; sign-out leaves no `cata_warmup_reflections_*`; copy matches behaviour.
- F-7/F-8: no string says the exercise improves perception; posting `warmupExerciseId: "x"` shows the specific message in es and en.
- Keep list: unlock inside Empezar, clock-scheduled cues, "La cata empezó" bar, `warmup_locked`.

## 6. Manual steps for Ricardo

- None to apply. Before merging run a two-phone synced run and an iOS + Android lock/call test.

## 7. Risks and rollback

- The resume prompt could appear on healthy runs: keep the decision pure, keyed on `ctx.state`. A re-seek must not fight the clock: seek only past the drift threshold. No schema change; each step reverts alone.

## 8. Native-readiness clause

- Wake-lock state comes from a native keep-awake plugin with the same `denied` contract. Resume also listens to app-foreground events; the prompt stays as fallback to a native playback audio session. Haptics via the Capacitor plugin; touch targets avoid edge-swipe zones.

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (`tests/warmup-overlayGate.test.ts`, `tests/warmup-audioResume.test.ts`, `tests/warmup-syncedRun.test.ts`)
- [ ] docs/flows.md updated; audit file gets `Fixed in S8-13 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for the resume prompt, wake-lock note and dusk pause
- [ ] gated items either done or left as named TODOs (F4 short version, F5 substitution) in the PR description
