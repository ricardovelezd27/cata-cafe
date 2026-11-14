# Constellation — the landing page's persistent particle field

One fixed full-viewport `<canvas>` sits behind every landing section and is never
unmounted. As the visitor scrolls, the cloud eases between one **formation per
fold**, telling the story of the copy: many palates → perceive → describe →
measure → converge → constellation.

```
journey/
  ConstellationMount.tsx   client wrapper: idle gate, kill-switch check, next/dynamic (ssr:false)
  ConstellationCanvas.tsx  the engine (canvas, bracketing, rAF loop, governor). Rarely edit.
  formations.ts            one builder per fold — THIS is what you author. Pure, unit-tested.
  bracket.ts               pure scroll→(foldA, foldB, blend). Unit-tested.
  intro.ts                 the arrival (scatter -> ring -> hero), time-driven. Pure, unit-tested.
  flags.ts                 sessionStorage flags shared by wrapper + engine (kill switch, arrival seen).
```

Mounted once in `app/[locale]/page.tsx`, first child of `<main>`.

## Choreography (load-bearing — each formation must mean its section's copy)

| fold | section (`data-fold`) | formation | colour |
|---|---|---|---|
| arrival | Hero, once per tab | dots scattered at every depth gather into one ring around the offer card, then let go (`intro.ts`) | the nine `--color-flavor-*` |
| 0 | Hero | scattered cloud, right-weighted on desktop | mint, ~20 % terracotta |
| 1 | Cátalo | three cupping bowls from above, peeking around the pinned screen | mint |
| 2 | Descríbelo | flavor-wheel rings, nine families, circling the pinned screen | `--color-flavor-*` |
| 3 | Compara y aprende | the 1–9 track under the pinned screen: terracotta cohort tight around 7.5, mint reference column | terracotta + mint |
| — | Features and Audience (no anchor) | the drift 3 → 4 runs across both | |
| 4 | Fundadores | the digits **100** (bar + two rings, procedural) | cream |
| 5 | Cierre | sparse net framing the closing line (no photo), neighbour segments drawn once arrived | mint |

**Anchors on the phone scroll stage.** The canvas reads every `[data-fold]`
element's position on each scroll. On a phone "Cómo funciona" is a scroll
stage (`../ScrollDeck.tsx`): its three step blocks sit in one place inside a
sticky stage, so they can no longer mark folds 1 to 3. While the stage is on,
ScrollDeck takes `data-fold` off them and puts it on three markers along the
track (`.deck-fold`, positions from `deckFoldOffset` in `../deckProgress.ts`),
each in the middle of the viewport when its card has landed. When the stage is
off, the step blocks are the anchors again. Never leave both sets active.

Rules when editing a formation: author in fractions of `W,H` then scale; use
`idR[i]` for any per-particle role so a particle keeps it while morphing; justify a
new meaning in the builder's comment; and keep the three layout rules, all in
`tests/landingFormations.test.ts`:

- **Desktop text lanes.** Hero copy is on the left; in "Cómo funciona" the copy is on
  the right for all three steps.
- **The pinned pile.** In "Cómo funciona" the app screens pile up in a box that stays
  put on the left. `deviceRect(W, H, narrow)` is the front card; `PILE` mirrors the
  `.steps-*` CSS in `app/globals.css` (change both together). Folds 1 to 3 are a halo
  around it: at most 40 % of a fold's dots may fall behind the card.
- **Phone text band.** On a phone every section leads with its text, so folds 0 to 3
  put little ink in the upper band of the screen (`NARROW_TEXT_BAND`).

## Engine knobs (`ConstellationCanvas.tsx`)

| knob | default | effect |
|---|---|---|
| `N` | `mobile ? 600 : 1600`, ×0.6 on ≤ 4 cores / Save-Data | particle count |
| DPR | `min(devicePixelRatio, 1.5)` | backing-store size |
| blend | `"lighter"` | additive glow over the green stage |
| `dot` | `max(1.8, min(W,H)·0.0028)` (×1.3 mobile) | dot size (the arrival multiplies it per dot by `Formation.scale`, i.e. depth) |
| ease | `1 − (1−0.085)^(dt/16.667)` | frame-rate-independent lerp |
| `DRAW_BUDGET_MS` | 8 | governor threshold on the DRAW cost (mean of 60 frames, after 90 warm-up frames); not sampled during the arrival |
| `MAX_DOWNGRADES` | 2 | each cuts `live` to 60 %; the next miss trips the kill-switch |
| idle | 4 s → 30 fps, 12 s → paused | wakes on scroll / pointer / visibility |

Colours are read from CSS tokens at mount (`--color-primary-fixed`,
`--color-secondary-container`, `--color-surface`, `--color-flavor-*`) — no hex in
the hot path; the only hex here is the documented fallback snapshot.

## Accessibility & failure modes

- `aria-hidden`, `pointer-events-none`, `z-0` under `relative z-10` sections.
- `prefers-reduced-motion`: snapped static frame per fold, ≤ 5 settle frames after
  a scroll, then the loop stops. Dev-only override: `?rm=1`.
- Kill-switch: after two governor cuts still over budget, the loop stops, the last
  frame stays, and `sessionStorage.cs_constellation_off = "1"` skips the mount for
  the rest of the session.
- Tab hidden → paused. Resize → rebuild + snap (150 ms debounce); a resize also ends the arrival.
- Arrival: once per tab (`sessionStorage.cs_constellation_intro`), and never under
  reduced motion, Save-Data, a hidden tab, or for a visitor who has already scrolled.
  Its clock starts on the first frame drawn; a scroll ends it at once.
- No JS / before idle: the page is complete without the field (hero keeps its
  CSS contour lines).

## Verifying

- `npm test` covers geometry (bounds, lanes, the pinned pile, the phone text band,
  colour membership, jitter order, net segments), the arrival (`tests/landingIntro.test.ts`)
  and bracketing (monotonic, adjacent-only, holds).
- In a real browser (dev): `window.__constellation` exposes `{ live, n, fold,
  downgrades, killed, running, meanDt, intro }`. To watch the arrival again:
  `sessionStorage.removeItem("cs_constellation_intro")` and reload at the top of the page. Busy-loop the main thread to watch the
  governor cut `live` then kill; reload with the flag set → no canvas mounted.
