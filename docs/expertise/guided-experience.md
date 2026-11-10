---
domain: guided-experience
researched: 2026-11-06
model: claude-sonnet
flows: [Movimiento Sensorial]
---

# Guided experience (audio + movement on phones)

Evidence note: primary sources were found for the web-platform items (MDN, WebKit bugs, WCAG, Android reference). For the UX-pattern items (Calm, Apple Fitness+, Nike Training Club, Down Dog) only secondary teardowns were found, so those principles are labelled **[practice]**. Items marked **[inference]** are engineering judgement with no direct source. Treat them as a bar to check, not as standards.

## 1. Scope

Covers a timed, expert-authored exercise played on a phone with sound, text, motion and optional voice: structure, cues, audio and TTS behaviour on the web and in a Capacitor WebView, timing and clocks, host-synced playback, accessibility, content operations and the evidence for the benefit. Leaves to other briefs: offline caching and sync (`offline-native`), group membership and realtime transport (`live-collab`), and the sensory protocol itself (`cupping-protocol`).

## 2. Principles

1. **Start audio only from a user gesture, and resume the context there.** Audio started outside user activation is blocked; a context created outside a gesture starts `suspended` and must be `resume()`d in a click handler. Source: MDN Autoplay and Web Audio best practices (2025).
2. **Schedule sounds on the audio clock, not on timers.** `AudioContext.currentTime` scheduling is the accurate path; `setTimeout`/`setInterval` are less precise. Source: MDN Web Audio best practices (2025). Timers are fine for UI, not for cue timing **[inference]**.
3. **Never depend on the ringer state or on sound alone.** On iOS the silent switch can mute Web Audio, and there is no API to read it; common workarounds play a silent looped media element after a gesture. So always offer an in-app mute and a visible indicator of "sound on/off". Source: unmute-ios-audio and write-ups (secondary, community-level). Essential information must not be audio-only and cues should have a visual (and haptic) twin. Source: Apple HIG accessibility guidance (mirror).
4. **One cue, one meaning, and a visual twin.** Fewer distinct cues are learned faster and are less confusing with eyes closed; each should be paired with an on-screen change. Source: **[practice]**, supported by Apple HIG accessibility guidance (mirror).
5. **Treat Web Speech as best-effort.** Known WebKit issues: no `end` event after `cancel()` (bug 211776), utterances queued right after `cancel()` lose events (bug 238189), voice choice could not be changed on iOS 15.4, `voiceschanged` unreliable in Safari. Current iOS status was not verified. Design with timeouts, a text fallback and no logic that waits for `end`. Sources: WebKit Bugzilla 211776 and 238189 (2020/2022); PhET utterance-queue #74 (2022).
6. **The text is the source of truth, voice is optional.** Every narrated line must also be readable on screen, with enough read time before the movement starts. Source: **[practice]**; consistent with WCAG 1.2 style alternatives **[inference]**.
7. **Give users pause, stop and hide for anything that moves or plays on its own.** Auto-playing motion over 5 s needs a control (2.2.2, A). `prefers-reduced-motion` covers interaction-triggered motion (2.3.3, AAA) but should not be treated as a substitute for a visible pause. Source: WCAG 2.2 via Hidde de Vries (2022-2024) and Deque.
8. **Honour `prefers-reduced-motion` for particles, figure animation and transitions**, with a calm static alternative that still conveys timing. Source: WCAG 2.3.3; Hidde de Vries.
9. **Keep the screen on while the exercise runs, and re-acquire after returning.** Wake Lock is auto-released when the document is hidden, may be rejected on battery saver, and must be re-requested on `visibilitychange`. Show its state. Source: MDN Screen Wake Lock API (Baseline 2025).
10. **Compute position from timestamps, not from tick counts.** After a lock, background or interruption the elapsed time must be recomputed from a monotonic reference, then the player must decide (resume, seek or end). Source: **[inference]**, motivated by MDN Wake Lock's hidden-document release.
11. **Synced playback: one leader timestamp, local offset, clamp skew, late joiners seek.** Follower phones derive position from the leader's start time plus measured clock offset; small drift is absorbed, large drift reseeks. Source: **[inference]**; no primary source found. Followers muted by default is consistent with the one-device-sounding rule (principle 3).
12. **Structure: arrive → steps → closing, with the length known before starting.** Beginners need guidance and a choice of length; Headspace's own diary-study work led to a recap with "start" or "explore". Always allow skip and exit, and state what happens after the end (return to where the user came from). Source: Raw Studio Headspace case study (secondary) and Irrational Labs (secondary) **[practice]**.
13. **Interruptions pause, they don't destroy.** Phone calls, other audio and navigation away should pause the run and offer resume or exit. On Android, system ducking does not apply to speech apps automatically; the app must handle `AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK` itself. Source: Android `AudioFocusRequest` reference (current).
14. **Eyes-closed modes need non-visual channels.** Add haptics for cue changes where available and a tone-based "open your eyes" signal; screen dim should not hide the pause control. Source: Apple HIG accessibility (mirror); Capawesome Haptics plugin docs.
15. **Claim only what the evidence supports.** Slow-paced breathing is well studied for autonomic and mood outcomes; a systematic review on cognition/attention is only at protocol stage (2025). No source found on movement warm-ups improving sensory acuity. Copy should say "to settle and focus", not "improves your tasting". Source: PMC12797364 (2025); Zaccaro et al., Frontiers in Human Neuroscience (2018).
16. **Expert content is versioned and reviewed, and localized as a unit.** Each exercise has an id, version, author/reviewer and per-locale text whose changes re-trigger review; word counts stay within read-beat limits. Source: **[inference]**; no primary source found.

## 3. Audit checklist

1. Is every `AudioContext` created or resumed inside the Start/Empezar handler? (P1)
2. Does the code handle `suspended`/`interrupted` state and call `resume()` after returning from background? (P1, P10)
3. Are all cues scheduled via `AudioContext.currentTime`, not `setTimeout`? (P2)
4. Is there an in-app mute toggle and a visible sound on/off state? (P3)
5. Does the code handle the iOS silent switch (silent media element or documented limitation)? (P3)
6. Does each of the four cues map to exactly one meaning, with no reuse? (P4)
7. Does each cue have a matching visual change (and haptic where supported)? (P4, P14)
8. Is speech gated by feature detection and a locale-matching voice check, with silent text fallback? (P5)
9. Does any logic wait for an utterance `end`/`error` event without a timeout? (P5)
10. Is `speechSynthesis.cancel()` followed immediately by `speak()` without a delay/guard? (P5)
11. Is every spoken line also visible as text for at least its read time? (P6)
12. Is there a visible pause/stop control reachable in every mode, including eyes-closed? (P7, P14)
13. Does `prefers-reduced-motion` disable particles, figure motion and transitions while keeping timing visible? (P8)
14. Is a screen wake lock requested during play, released at end/exit, and re-requested on `visibilitychange`? (P9)
15. Is elapsed time derived from a monotonic timestamp rather than accumulated ticks? (P10)
16. On `visibilitychange`/lock, does the player pause or reseek explicitly and tell the user? (P10, P13)
17. In synced mode, is position computed from the host's start time plus a clock offset, with a skew clamp? (P11)
18. Do late joiners and reconnecting followers seek rather than start from zero? (P11)
19. Are followers muted by default and is the unmute explicit? (P11, P3)
20. Is total duration and step count shown before starting? (P12)
21. Can the user skip or exit at any time, and is the "seen" flag set only on a defined event? (P12)
22. Does the end state say what happens next and return to the right place? (P12)
23. Is there a defined behaviour for incoming call/other-audio interruptions (pause + resume prompt)? (P13)
24. Does any user-facing copy claim a performance or sensory benefit? (P15)
25. Does every exercise have an id, version and per-locale review status that changes when text changes? (P16)

## 4. Anti-patterns

- **Autoplay on mount or route change**: silently blocked; user sees a running timer with no sound.
- **Timer-driven cues** (`setInterval` per second): drift and burst-firing after the tab was backgrounded.
- **Accumulating elapsed time per tick**: a locked screen freezes it, so the exercise resumes mid-step with wrong audio.
- **Awaiting TTS `end`**: on iOS this can hang the run (WebKit 211776).
- **Cue reuse**: one bell for start, end and warning; with eyes closed users cannot tell what happened.
- **Audio-only instruction** in eyes-closed mode with no visual or haptic fallback.
- **Reduced-motion removing the timeline** along with the animation, leaving no progress signal.
- **Every follower plays sound** in a room: overlapping, offset audio.
- **Marking an exercise "seen" on open**, so a crash or skip hides it forever.
- **Health-style claims** ("sharpens your palate") without evidence.

## 5. Native-app considerations

- **Background and lock:** A WebView is suspended with the app; the Web Audio schedule may stop at screen lock. If playback must continue with the screen locked, use native audio with the playback category; for TTS, `@capacitor-community/text-to-speech` documents an iOS category (`ambient`/`playback`) where `playback` continues in the background, and Capawesome's speech synthesis plugin advertises background synthesis. Android background behaviour was not verified. Sources: npm plugin page, Capawesome docs.
- **Native TTS** avoids the Web Speech bugs in principle 5 and offers reliable voice listing; test that Spanish voices exist offline.
- **Audio focus (Android) and session category (iOS):** request transient focus, handle ducking/loss manually for speech (Android `AudioFocusRequest`). The iOS silent-switch workaround is unnecessary if a playback session is set natively **[inference]**.
- **Haptics:** a Capacitor Haptics plugin gives impact, notification and pattern vibrations; use it as the non-audio twin of the four cues, with a setting to disable it.
- **Keep awake:** Wake Lock is Baseline 2025 on the web; a native keep-awake plugin is the fallback in the shell (plugin API not verified here).
- **Permissions and review:** playback, TTS and haptics normally need no runtime permission prompt; declare any background-audio mode in the iOS capabilities and re-check against store review rules **[inference]**.

## 6. Vocabulary

| Spanish | English | Meaning |
|---|---|---|
| Movimiento Sensorial | Sensory Movement | The warm-up feature |
| Calentamiento | Warm-up | Short routine before a cupping |
| Campana | Bell | Cue: a movement starts |
| Tic | Tick | Cue: a movement ends / read beat starts |
| Cuenco | Bowl | Cue: closing starts |
| Doble | Double chime | Cue: open your eyes |
| Llega | Arrive | Opening breathing segment |
| Zumbido / hum | Hum | Drone under a movement |
| Pausa de lectura | Read beat | Time to read a step before it starts |
| Modo penumbra | Dusk mode | Eyes-closed low-light display |
| Reloj único | Single clock | One time source driving all outputs |
| Anfitrión / seguidor | Host / follower | Synced-mode roles |
| Desfase | Skew | Difference between follower and host position |
| Bloqueo de pantalla activa | Wake lock | Keeps screen on |
| Movimiento reducido | Reduced motion | OS accessibility preference |

## 7. Open practice questions

1. Which cue should survive if only one can be heard (e.g. phone on silent, no headphones)?
2. Is the 3-6 minute length right before a cupping, and should the cupper be able to choose a short version?
3. Is the voice meant to replace the text or accompany it; should a recorded voice replace TTS for the final version?
4. What should happen if someone is interrupted mid-exercise: resume where they stopped, restart the step, or leave?
5. Are there people for whom a movement should be replaceable (injury, seated, standing space)?
6. What benefit do you want to claim (settle, focus, ritual), and what do you actually observe in cuppers?
7. Which wording is you versus the guide voice, and who approves changes to the Spanish and English text?
8. In a group, should everyone do it at the same moment, or is each person free to skip without affecting others?

## 8. Sources

- MDN, Screen Wake Lock API, 2025: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
- MDN, Web Audio API best practices, 2025: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- MDN, Autoplay guide, 2025: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- Systematic review protocol, slow-paced breathing and cognition (PROSPERO CRD42024615253), 2025: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12797364/
- Android AudioFocusRequest reference, current: https://developer.android.com/reference/android/media/AudioFocusRequest
- Capawesome speech synthesis plugin docs, current (secondary vendor docs): https://capawesome.io/docs/sdks/capacitor/speech-synthesis/
- Capawesome haptics plugin docs, current: https://capawesome.io/docs/sdks/capacitor/haptics/
- @capacitor-community/text-to-speech, current: https://npmjs.com/package/@capacitor-community/text-to-speech
- Hidde de Vries, Meeting 2.2.2 with prefers-reduced-motion, 2022: https://hidde.blog/meeting-2-22-pause-stop-hide-with-prefers-reduced-motion/
- PhET utterance-queue issue 74 (iOS 15.4 voice change), 2022: https://github.com/phetsims/utterance-queue/issues/74
- WebKit Bugzilla 238189, 2022: https://auto-bugs.webkit.org/show_bug.cgi?id=238189
- unmute-ios-audio (secondary, community), c. 2020-2024: https://github.com/feross/unmute-ios-audio
- Raw Studio, How Headspace designs for mindfulness (secondary), c. 2022: https://raw.studio/blog/how-headspace-designs-for-mindfulness/
- Apple HIG accessibility, audio and haptic feedback (third-party mirror; check developer.apple.com), current: https://app.uxcel.com/courses/apple-hig/accessibility-inclusion-standards-812/audio-and-haptic-feedback-0671
- Zaccaro et al., How breath-control can change your life, Frontiers in Human Neuroscience, 2018: https://www.frontiersin.org/articles/10.3389/fnhum.2018.00353/full
- WebKit Bugzilla 211776, 2020: https://bugs.webkit.org/show_bug.cgi?id=211776
