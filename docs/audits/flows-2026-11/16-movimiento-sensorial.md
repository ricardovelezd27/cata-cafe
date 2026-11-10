# 16 · Movimiento Sensorial

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 1492–1557 · **Domain briefs applied:** `guided-experience` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-guided-experience (claude-sonnet-5-5) · **Verification:** done 2026-11-06 (guided-experience verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

Five slow-movement exercises (Kim's) reach the cupper from four places: the library (`/app/warmup`, guests allowed), the waiting room ("Mientras esperas"), a pre-first-sample interstitial on `/cup` when the owner picked an exercise in the wizard or edit form, and the master's synced "Empezar con el grupo" run. One `WarmupPlayer` plays all of them on one clock (`hooks/useRunClock.ts`), with cues scheduled on the Web Audio clock, optional TTS, a wake lock and a local-only reflection step in library mode. "Seen" is stored per session, user and exercise (`lib/sessionMoments.ts:21`) and is set on finish or skip, not on open.

The board's spec is partly stale. Its waiting-room requirement ("does not mark seen", "does not highlight the configured exercise") is already implemented: `WaitingRoomClient.tsx:110-116` reads the seen-set and `:189-199` calls `markMomentSeen` when the chosen exercise closes. The "no nav item" claim also predates PR2. Two board gaps are still true (offline interstitial, reflections) and one is true but trivial (`invalid_warmup` copy).

## 2. Expert bar applied

- **P1/P2 audio only from a gesture, scheduled on the audio clock.** Q1–3: is the context unlocked in Empezar, resumed after background, are cues clock-scheduled?
- **P3/P4/P14 sound is never the only channel, and the eyes-closed mode keeps a reachable pause.** Q4, Q7, Q12.
- **P9/P10/P13 wake lock, timestamp clock, interruptions pause.** Q14–16, Q23.
- **P11 synced playback.** Q17–19.
- **P12 structure and the "seen" flag.** Q20–22.
- **P15 claim only what is evidenced.** Q24.
- **Lens cupping-protocol P9:** the SCA timeline is parallel and temperature-led (pour, 3–5 min crust, break, liquor near 70 °C). A 3–8 minute exercise only fits before the water is poured.
- **Lens offline-native §3:** the rebuilt-offline screen must behave like the online one; per-device state must not leak across users.

## 3. Findings

### F-movimiento-sensorial-1 · The interstitial can open after the cupping has started · severity: P2 · status: new

- **Problem** — `shouldShowWarmupOverlay` (`lib/warmup/overlayGate.ts:30-36`) takes no `startedAt` or pour input. Its only live-group exception is "owner of a LIVE group session → false" (`:34`). `WarmupMoment` is enabled whenever the session is not closed (`CupClient.tsx:2322`, `enabled={sessionStatus !== "closed"}`). A participant who did not open the exercise in the waiting room is sent to `/cup` when the master presses "Iniciar cata" (`WaitingRoomClient.tsx:202-213`) and meets a 3–7 minute full-screen exercise while the master's cups are already cooling. A late joiner who missed the synced run (`isMissed`, `lib/warmup/syncedRun.ts:50`) lands in the same overlay. The waiting room carefully cuts a running exercise at the start ("La cata empezó", `START_EXIT_CAP_MS` 30 s), so `/cup` contradicts it.
- **Implication** — A participant loses the early, most volatile minutes of a parallel cupping, or learns to skip the overlay every time. Trust in the feature drops, and a skipped overlay is marked seen for good.
- **Fix** — Decide with Kim where the exercise belongs. Proposed behaviour: for a live group session whose cupping has started, `/cup` does not auto-open the interstitial; it offers a quiet "Hacer el ejercicio después" entry (or nothing). Solo and async sessions keep today's behaviour. **Acceptance:** (1) a participant arriving on `/cup` after `startedAt` sees the samples at once; (2) a participant who opens `/cup` before start (async) still gets the overlay; (3) the gate's truth table in `tests/` gains a `started` row. **Size:** S.
- **Native** — The gate runs client-side from props, so the shell needs no extra work; keep the rule in the pure gate module so it stays testable.
- **Confidence** — verified-in-code (gate and wiring); the live-group experience needs two phones.
- **Kim?** — yes, K-movimiento-sensorial-1.
- **Invariant check** — none touched (the warm-up is display-only; scoring, authz and the close routine are unaffected).
- **Fixed in S8-13 (PR pending)** — `startedAt` in the gate, live group after start never opens the overlay (`tests/warmup-overlayGate.test.ts`). Kim F1 answers b/c left as TODO(Kim F1).

### F-movimiento-sensorial-2 · A synced run never surfaces wake-lock failure and never re-syncs after the phone sleeps · severity: P2 · status: new

**Partly fixed in S8-15 (PR #…): the waiting room recreates its channel and re-reads getWaitingState on foreground resume (hooks/useForegroundResume). The synced-run re-seek and the wake-lock-lost note stay with S8-13.**

- **Problem** — A synced player opens straight in `run` (`WarmupPlayer.tsx:88`, `useState(seekToMs != null ? "run" : "intro")`), so the only place that tells the person to keep the screen on (`wakeDenied` → `t.wakeLockNote`, `:1026`) is never shown to followers or to the master. `useWakeLock` reports `denied` (`hooks/useWakeLock.ts:215`) but nothing reads it during a run. In synced mode the clock does not pause on hide (`pauseOnHide: !synced`, `WarmupPlayer.tsx:97`) and the single seek happens once (`seekedRef`, `:109-114`). If the screen locks (battery saver, iOS < 16.4, power button) the follower's `performance.now()` clock and the host's wall-clock timeline can diverge, and no re-seek happens on `visibilitychange`.
- **Implication** — The cohort that follows a group exercise with eyes closed gets no warning, may find the phone dark mid-run, and may come back several seconds behind the room, with cues out of step.
- **Fix** — In synced mode show a small persistent "pantalla encendida / puede apagarse" state when the lock is denied or dropped. On return to visible, recompute position from `warmupStartedAt` plus skew and re-seek (or leave via the existing "missed" path if under 20 s remain). **Acceptance:** (1) with wake lock unsupported the synced player shows the note; (2) locking for 10 s and unlocking lands within about 1 s of the host's position; (3) library and session behaviour are unchanged. **Size:** M.
- **Native** — A native keep-awake plugin replaces the Wake Lock API, so the "denied" state must come from the plugin in the shell. Resume must use app-foreground events, not only `visibilitychange`.
- **Confidence** — needs-runtime-check (two phones: lock one for 10 s, compare cues).
- **Kim?** — no.
- **Invariant check** — none touched (never read `warmupStartedAt` from scoring; the math stays in `lib/warmup/syncedRun.ts`).
- **Fixed in S8-13 (PR pending)** — persistent wake-lock note in synced runs; re-seek on visibility/pageshow past 1.5 s drift (`resyncPositionMs`, `shouldResync`).

### F-movimiento-sensorial-3 · After a lock or interruption the exercise can continue silently with eyes closed · severity: P2 · status: new

- **Problem** — On return from hidden, the clock resumes by itself (`lib/warmup/runClock.ts:80-85`, `setHidden` → `resumeIfAllowed`) and the audio effect calls `audio.schedule` (`WarmupPlayer.tsx:385-396`). `schedule` calls `resumeIfNeeded(c)`, a fire-and-forget `c.resume().catch(() => {})` (`hooks/useWarmupAudio.ts:92-94, 242`), outside a user gesture. Only iOS `interrupted` pauses the clock (`WarmupPlayer.tsx:400-402`); a context that stays `suspended` is not detected, so cues are queued on a frozen audio clock while the visual timeline advances. No "sound is off" state is shown beyond the mute icon.
- **Implication** — During the eyes-closed legs the cupper relies on campana, tic and doble to know when to move or open their eyes. A silent resume leaves them with a wrong rhythm and no "abre los ojos" cue, and nothing on screen says why.
- **Fix** — After a resume from hidden or interrupted, check the context state. If it is not `running`, pause and show a "Toca para continuar" prompt (the tap supplies the gesture and re-schedules from the current position). The same prompt covers calls. **Acceptance:** (1) background the page for 15 s mid-leg, return: either sound is running and cues land on the beat, or the player is paused with the prompt; (2) the prompt never appears in muted mode; (3) no change for foreground runs. **Size:** S–M.
- **Native** — A WebView is suspended with the app. Use a native playback audio session and Android audio-focus handling for calls and ducking (guided-experience §5), or keep this prompt as the fallback.
- **Confidence** — needs-runtime-check (iOS Safari and Android Chrome: lock 15 s mid-run, confirm audio state on return).
- **Kim?** — no.
- **Invariant check** — none touched.
- **Fixed in S8-13 (PR pending)** — `audioResumeDecision` + `checkContext`; paused player with "Toca para reanudar" when audio stays suspended after ~300 ms; never when muted.

### F-movimiento-sensorial-4 · The offline-rebuilt `/cup` drops the warm-up · severity: P3 · status: confirms-board(Pantalla /cup reconstruida offline sin el calentamiento)

**Fixed in S8-09** (draft PR, branch `claude/s8-09-offline-impl`): `cacheProps` stores the static warm-up (never `warmupStartedAt`/`serverNow`); `cup/error.tsx` rebuilds it, treating a cupper with local drafts as returning.

- **Problem** — `cacheProps` writes the props payload on each online mount (`CupClient.tsx:648-663`). The list has `locale, session, isOwner, …, userId` but no `warmup`. `cup/error.tsx:123-141` rebuilds `CupClient` from that cache, so `warmup` is `undefined` and `WarmupMoment` never renders (`CupClient.tsx:2312`). Re-read on this branch: the gap is still present.
- **Implication** — After an offline hard refresh the configured exercise silently never appears. Minor for the cupper, and untested.
- **Fix** — Cache `warmup.exerciseId` (strings are bundled static data and can be rebuilt on the client) so the offline rebuild honours the seen-set exactly like online. **Acceptance:** an unseen exercise opens after an offline hard refresh; a seen or absent one does not; the master and synced fields stay absent offline. **Size:** S.
- **Native** — The cache lives in IndexedDB, so it holds in the shell. Do not cache `warmupStartedAt` or `serverNow` (a stale timestamp would start a ghost synced run).
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — the offline store stays client-only; no authz change.

### F-movimiento-sensorial-5 · Reflection notes are saved but unreadable, shared across users and survive sign-out · severity: P3 · status: confirms-board(Las reflexiones se guardan pero no se pueden ver ni son por usuario)

- **Problem** — `saveReflection` writes `cata_warmup_reflections_<exerciseId>` with no user id (`lib/warmup/reflections.ts:5,18-31`). Nothing reads the list (a repo search finds only that file). `clearLocalDeviceState` removes `cata_moment_*` keys but not these (`lib/offline/deviceState.ts:33-39`). The reflect step promises "Guardado en este dispositivo" (`messages/es.json`, `warmup.reflect.savedNote`).
- **Implication** — On a shared tablet the next cupper's notes append to the previous person's, and "saved" has no way back to the text. A trust and privacy leak, not data loss.
- **Fix** — Either key notes by user, show them on the exercise page and clear them on sign-out, or stop saving and stop claiming "guardado". **Acceptance:** two users on one device do not see each other's notes; sign-out leaves no `cata_warmup_reflections_*`; copy matches behaviour. **Size:** S–M.
- **Native** — localStorage is per app sandbox; apply the same sign-out clearing in the shell and do not rely on it surviving a reinstall.
- **Confidence** — verified-in-code.
- **Kim?** — yes, K-movimiento-sensorial-2.
- **Invariant check** — none touched (data stays local, never joined with evaluations).
- **Fixed in S8-13 (PR pending)** — reflections no longer written, savedNote removed, legacy `cata_warmup_reflections_*` purged on sign-out. Kim F2 answer a left as TODO(Kim F2).

### F-movimiento-sensorial-6 · Eyes-closed runs hide the pause control, and a stray skip is permanent · severity: P3 · status: new

- **Problem** — After 4 s on a slow leg the footer controls get `opacity: 0; pointer-events: none` (`WarmupPlayer.module.css:208`; `CHROME_HIDE_MS`, `WarmupPlayer.tsx:56,509-513`). One touch reveals them, so pausing takes two taps with no feedback, and the dusk veil dims the screen further. The top-bar exit stays tappable, and `onExit` marks the moment seen with no confirmation (`WarmupMoment.tsx:74`, `WaitingRoomClient.tsx:189-199`).
- **Implication** — Someone interrupted with eyes closed cannot pause quickly. Someone who brushes the exit loses the exercise for that session, which is irreversible.
- **Fix** — Make the first tap on a hidden control a pause (or give the stage a tap-to-pause target) with a short haptic, and ask for a one-tap confirmation before a mid-run skip marks the exercise seen. **Acceptance:** during a dusk leg one tap pauses; skipping within the first 20 s does not mark it seen. **Size:** S.
- **Native** — Touch targets must meet the platform minimum and avoid edge-swipe zones; haptics through the Capacitor plugin.
- **Confidence** — inferred-from-code (needs a phone to feel the double tap).
- **Kim?** — no.
- **Invariant check** — none touched.
- **Fixed in S8-13 (PR pending)** — first tap in a dusk leg pauses; `onExit({ completed, elapsedMs })`; skip before 20 s leaves it unseen, later skip asks a second tap.

### F-movimiento-sensorial-7 · Copy promises benefits the evidence does not support · severity: P3 · status: new

- **Problem** — User-facing copy says "para despertar la percepción antes de oler y probar" (`messages/es.json`, `warmup.dashboard.body`), "Vuelve a la cata con los sentidos despiertos" (`warmup.player.doneBody`) and "la lentitud abre la percepción" (`lib/warmup/exercises.ts:220`). Guided-experience P15: slow breathing is documented for calm and focus; nothing was found for sensory acuity.
- **Implication** — A cupper may read "improves my tasting" and a teacher may repeat it. A trust risk if Kim's lab tests it and sees nothing.
- **Fix** — Reword to settling and ritual ("para asentarte antes de catar"), not acuity, once Kim approves. **Acceptance:** no string says the exercise improves perception; es and en change together. **Size:** S.
- **Native** — n/a (same strings in both locales).
- **Confidence** — verified-in-code.
- **Kim?** — yes, K-movimiento-sensorial-3.
- **Invariant check** — none touched.
- **Fixed in S8-13 (PR pending)** — dashboard body, done body, exercise purpose and library intro reworded to settling (es+en). Kim F3 answers b/c left open.

### F-movimiento-sensorial-8 · A tampered or retired warm-up id returns a generic error · severity: P3 · status: confirms-board(Id de calentamiento manipulado o retirado)

- **Problem** — `validateSessionMeta` returns `invalid_warmup` (`app/actions/sessions.ts:227-229`) and `updateSession` returns it too (`:970`), but there is no `invalid_warmup` string in `messages/*.json` or in the wizard's `errors` map (`sessions/new/page.tsx:100-109`), so `NewSessionForm.tsx:530-531` falls back to `generic`. The wizard's select only offers exercises 1–3, so a normal user cannot reach it.
- **Implication** — Only a stale form or a tampered request hits it: a rare, small robustness gap.
- **Fix** — Add the localized copy and map it in both forms. **Acceptance:** posting `warmupExerciseId: "x"` shows the specific message in es and en. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — the server-action contract is kept (code in `errors.codes`).

## 4. Keep — works well

- Audio unlocked synchronously inside Empezar, plus the mute toggle (`WarmupPlayer.tsx:422-423, 661-665`; `hooks/useWarmupAudio.ts:210-229`, including `audioSession.type = "playback"` for the iOS silent switch).
- Cues pre-scheduled on `AudioContext.currentTime`, with haptics as a twin (`useWarmupAudio.ts:231-256`).
- One clock derived from timestamps, seek-safe, with a wall-clock timeout so an occluded window still settles (`lib/warmup/runClock.ts`, `hooks/useRunClock.ts:84-99`).
- TTS never waits on `end`: safety timeout, and the text is always on screen (`useWarmupAudio.ts:303-304`).
- Wake lock re-acquired on `visibilitychange` (`hooks/useWakeLock.ts:200-205`); iOS "interrupted" pauses (`WarmupPlayer.tsx:400-402`).
- Reduced motion keeps timing visible through seconds left (`WarmupPlayer.tsx:345-348`).
- Seen-set keyed by user and value, frozen at mount, with storage fallbacks, cleared on sign-out (`lib/sessionMoments.ts`, `WarmupMoment.tsx:49-62`, `lib/offline/deviceState.ts:33-39`).
- Waiting room honours the pick and marks it seen; the "La cata empezó" docked bar and cap (`WaitingRoomClient.tsx:110-116, 185-214`).
- `warmup_locked` server guard once the session has started (`app/actions/sessions.ts:981-984`).

## 5. Not verified

- Real audio-context behaviour after lock or a call on iOS and Android (F-3). Cheapest check: a two-minute run on each, locking for 15 s.
- Synced skew: `serverNow` is stamped at server render and compared with the client clock on hydrate (`WaitingRoomClient.tsx:125-128`), so followers may sit a second or two behind. Measure with two phones.
- `speechSynthesis.cancel()` is followed at once by `speak()` (`useWarmupAudio.ts:309-316`), the WebKit 238189 pattern. Voice is opt-in with a timeout, so impact is probably low; test on an iPhone with Spanish voices.
- Spanish voice availability offline in a Capacitor shell.
- Whether five exercises of 3–8 minutes fit real cuppings (Kim questions below).

## 6. Questions for Kim (collected)

- **K-movimiento-sensorial-1.** ¿En qué momento tiene sentido hacer el movimiento: solo antes de servir el agua, o también si alguien llega cuando la cata ya empezó? Hoy, quien no lo hizo en la sala de espera lo ve al entrar a la mesa, con los cafés ya enfriándose. Opciones: (a) solo antes del agua, y después se ofrece como opcional discreto; (b) siempre, como ahora; (c) el catador elige "hacerlo luego".
- **K-movimiento-sensorial-2.** Al cerrar el ejercicio se invita a escribir dos respuestas. ¿Quieres que cada catador pueda volver a leerlas, o prefieres que no se guarden? Opciones: (a) guardarlas por persona y poder verlas; (b) no guardarlas.
- **K-movimiento-sensorial-3.** ¿Qué queremos decir que hace el ejercicio: "asentarte y concentrarte" o "despertar los sentidos"? Lo segundo no tiene respaldo. Opciones: (a) calmar y enfocar; (b) ritual previo a la cata; (c) mantener la frase actual si Kim lo observa en sus catadores.

## 7. Verification log

- F-movimiento-sensorial-1 — CONFIRMED — `overlayGate.ts:30-36` has no started/live-participant input; `CupClient.tsx:2322` enables whenever not closed; waiting room pushes to /cup at start (`WaitingRoomClient.tsx:202-207`) with no seen-mark. Overlay is skippable: annoyance, not loss; needs Kim's call. — severity: keep
- F-movimiento-sensorial-2 — PLAUSIBLE — Code part confirmed: `wakeDenied` only reaches the intro panel (`WarmupPlayer.tsx:727,1026`), synced opens in `run` (`:88`), `pauseOnHide: !synced` (`:97`), single seek (`:111`). Drift after sleep depends on browser `performance.now` behaviour; settle with two phones. Optional exercise, wake lock rarely denied. — severity: → P3
- F-movimiento-sensorial-3 — PLAUSIBLE — Code confirmed: `schedule` calls fire-and-forget `resumeIfNeeded` (`useWarmupAudio.ts:92-94,242`) and only `interrupted` pauses (`WarmupPlayer.tsx:400-402`); a merely `suspended` context is undetected. Whether iOS/Android refuse the resume needs a real-device lock test. — severity: keep

