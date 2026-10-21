# S6 audit — Movimiento Sensorial: experience review (lead, 2026-10-21)

Reviewed live on `main` (B1–B4) at 375×812 with the dev test user, plus the DOM/CSS of every
figure on `/app/warmup/dev-figures`. Method reference: `docs/product/cafe-sensible-method-brief.md`
(Kim Ossenblok — 7 senses = vista, oído, olfato, gusto, tacto + **propiocepción** + **interocepción**;
Movimiento Sensorial after Danis Bois: seated, slow, minimal, no effort; "primero sientes, después
describes"; "si vas deprisa, reduces la sensibilidad"; eyes closed because sight eats attention).

## What works (verified)
- **Mechanics are correct.** Sampled the DOM every 2.5 s through exercise 1: step 1 (rápido) runs
  the arm up/down twice at 4 s each; step 2 (lento) rotates the arm linearly −11° → −140° across
  its 15 s (`armUp`, linear easing — constant speed *is* the exercise); step 3 holds at −95°
  ("párate ahí") with the torso "breathing"; 3-second holds between steps; `paused` class stops the
  keyframes. Eyes-closed variants draw closed lids + ghosted pupils. Reduced-motion → static end
  pose + arrow, no auto-advance.
- **Content is Kim's text verbatim** (library page, intro: postura, evolución, regla de seguridad;
  closing questions shown once at the bottom of the library).
- **Structure matches the brief**: intro → steps with countdown → observe → closing → done;
  skippable at every point; keyboard + aria-live fixed in B3; guest-reachable; dashboard card.
- **Layout at 375×812**: figure ≈ 42 dvh on a warm tinted panel, big serif timer, step text in
  Newsreader, evolution chips, docked Saltar/Siguiente + pause. Clean, on-brand, no overflow.

## Where it falls short of "abrir los sentidos" (my assessment)
The v1 is a *correct instruction player*; it is not yet a *sensory experience*. Specific gaps,
ordered by impact:

1. **It talks to the eyes while asking you to close them.** Steps 5–6 of every exercise are "ojos
   cerrados", but the only guidance is on-screen text and a countdown. There is no audio, no
   haptic tick at the 15-s turn-around or the 3-s hold, so the user must open their eyes to know
   where they are — the opposite of the method. (Brief implications 4, 5.)
2. **Countdown pressure.** A large "15 s → 1 s" numeral is a timer, and timers make people hurry.
   The method wants slowness without evaluation. Replace with a soft, breathing progress ring and
   an optional, quiet audio cue; keep the number only in an "accessible" mode.
3. **The figure is a smiley stick-man.** Circle head, rounded-rect torso, dot eyes, a smile. It
   reads as a children's diagram, not as "tu cuerpo". For an app whose whole premise is embodied
   perception, the figure should feel like a calm human silhouette (continuous single-weight line,
   no face, subtle weight/ground shadow), with the moving segment highlighted and the rest ghosted.
4. **Too much text during movement.** While the arm moves there are: title, step text, three
   evolution chips, step counter, timer, status line. The brief says "during movement show almost
   no text". Collapse to: one short cue line (large), the figure, the ring.
5. **No interior attention cue.** The "observa" bullets (the heart of the exercise — where do you
   feel resistance, where is your hand in space) appear as a list *after* the movement. They should
   surface as single whispered prompts *during* the slow legs (one at a time, fading), and the two
   closing questions should get a quiet reflection screen with optional free text (never scored,
   kept apart from CVA data).
6. **No sound at all.** Even a single soft chime at phase changes + an optional guided voice (Kim's
   own, pre-recorded, tuteo, long silences) would carry the exercise with the phone face-down.
7. **No "stay still, only attend" option** for limited mobility; no breath cue at the start
   ("pies en el suelo, hombros sueltos") — the brief's opening line.
8. **Desktop (md+) two-column** is implemented but secondary; the ritual is a phone-on-the-table
   thing. Fine as is.

## Verdict for production
- Functionally **GO** as a library (`/app/warmup`) — nothing broken, text faithful, no risk.
- As the flagship "open the senses" moment it is **a v1 that needs a v2 before it is promoted**
  (dashboard card is fine; don't put it in Kim's talks yet).

## v2 proposal (one PR, ~2–3 days, Fable design + Sonnet build)
| Area | Change |
|---|---|
| Guidance channel | `useWarmupAudio`: soft chime at step start / turn-around / hold end; optional voice track per step (`/public/warmup/<exercise>/<step>.m4a`, Kim records); Vibration API ticks on Android, silent fallback on iOS |
| Progress | replace numeral with a breathing ring (CSS `conic-gradient` driven by the same countdown); numeral only when `prefers-reduced-motion` or an "accesible" toggle |
| Figure | redraw the mannequin as a single-weight line silhouette (no face), moving segment in `--color-secondary`, rest at 40 % opacity; closed-eyes = whole figure dims and the ring glows |
| Text | one cue line per step; "observa" prompts fade in one at a time during slow legs (every ~5 s); evolution chips move to the intro |
| Reflection | closing screen: 30-s neutral hold with the ring, then the two questions with optional free text → `warmup_reflections` (local-only first, sync later; never in CVA data) |
| Start | 10-s "llega" screen: feet, shoulders, one breath, "cuando quieras" button (no auto-start) |
| Accessibility | "quieto, solo atiende" variant; large-text mode; all cues also as aria-live |
| Pre-cupping | once B6 ships: the overlay opens on the first sample only when the owner chose an exercise; default off for calibration, on for "ritual" when S5 item 3 lands |

Decisions Kim should take before v2: (a) permission to reproduce the exercises in-app with
his name; (b) whether he records the voice; (c) the exact closing questions (unverified in his
public material); (d) order/duration for the pre-cupping version (2–5 min max).
