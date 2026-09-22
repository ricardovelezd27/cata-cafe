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
  flags.ts                 sessionStorage kill flag shared by wrapper + engine.
```

Mounted once in `app/[locale]/page.tsx`, first child of `<main>`.

## Choreography (load-bearing — each formation must mean its section's copy)

| fold | section (`data-fold`) | formation | colour |
|---|---|---|---|
| 0 | Hero | scattered cloud, right-weighted on desktop | mint, ~20 % terracotta |
| 1 | Cátalo | three cupping bowls from above (ring clusters) | mint |
| 2 | Descríbelo | flavor-wheel annulus, nine families | `--color-flavor-*` |
| 3 | Calibra (+ Features holds) | the 1–9 track: terracotta cohort tight around 7.5, mint reference column | terracotta + mint |
| — | Audience (no anchor) | blend 3 → 4 runs across it | |
| 4 | Fundadores | the digits **100** (bar + two rings, procedural) | cream |
| 5 | Cierre | sparse net over photo 5, neighbour segments drawn once arrived | mint |

Rules when editing a formation: author in fractions of `W,H` then scale; use
`idR[i]` for any per-particle role so a particle keeps it while morphing; keep the
desktop text lanes (see `tests/landingFormations.test.ts`); justify a new meaning
in the builder's comment.

## Engine knobs (`ConstellationCanvas.tsx`)

| knob | default | effect |
|---|---|---|
| `N` | `mobile ? 600 : 1600`, ×0.6 on ≤ 4 cores / Save-Data | particle count |
| DPR | `min(devicePixelRatio, 1.5)` | backing-store size |
| blend | `"lighter"` | additive glow over the green stage |
| `dot` | `max(1.5, min(W,H)·0.0022)` (×1.3 mobile) | dot size |
| ease | `1 − (1−0.085)^(dt/16.667)` | frame-rate-independent lerp |
| `FRAME_BUDGET_MS` | 24 | governor threshold (mean of 60 frames, after 90 warm-up frames) |
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
- Tab hidden → paused. Resize → rebuild + snap (150 ms debounce).
- No JS / before idle: the page is complete without the field (hero keeps its
  CSS contour lines).

## Verifying

- `npm test` covers geometry (bounds, lanes, colour membership, jitter order,
  net segments) and bracketing (monotonic, adjacent-only, holds).
- In a real browser (dev): `window.__constellation` exposes `{ live, n, fold,
  downgrades, killed, running, meanDt }`. Busy-loop the main thread to watch the
  governor cut `live` then kill; reload with the flag set → no canvas mounted.
