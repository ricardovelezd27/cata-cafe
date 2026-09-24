# S4 — Higiene de resultados y deuda técnica pequeña (sin cambios de comportamiento)

> **Cuándo:** cualquier momento; ideal ANTES de S2 (el ítem 5 deja `npm run lint` a cero, lo que permite un job de lint bloqueante en CI) y antes de S3 (los ítems 3 y 4 simplifican el radar).
> **Dónde:** sesión nueva, rama desde `main`. Un commit por ítem.
> **Requiere de Ricardo:** nada; revisión del PR.

---

## 1. Prompt (copiar y pegar)

```
Context: Café Sensible (read CLAUDE.md and DESIGN.md, then docs/prompts/S4-results-hygiene.md — it is the implementation plan; do its items in order, one commit per item, running `npx tsc --noEmit`, `npm run lint` and `npm test` after each). No behaviour change is intended anywhere: every item must be pixel-equivalent or a pure refactor, and you must say explicitly in each commit message what could NOT be kept identical, if anything. Baseline before you start: `npm run lint` reports 4 errors / 5–7 warnings in app/[locale]/dev/page.tsx, app/actions/dev.ts, components/ui/IntensitySlider.tsx (and possibly components/results/SampleDetail.tsx). Do not touch lib/scoring.ts logic, the SQL trigger, AggregateScore, or anything under app/actions. Delegate items 2 and 6 to Sonnet with explicit file ownership; do items 1, 3, 4, 5 yourself. Forbid bare `git stash`.
```

---

## 2. Ítems

### Ítem 1 — `ScorePill` usa `scoreBand()` (Fable)
- Hoy `components/ui/Badge.tsx` `ScorePill` repite los umbrales 85/75 que ya define `scoreBand()` en `lib/scoring.ts`.
- Cambiar a `const band = scoreBand(score)` y mapear banda → clases. Comprobar que `scoreBand` es puro (sin `server-only`) para poder importarlo en un client component; si no, mover la función a `lib/sessionState.ts`-style pure module y re-exportar.
- Test: `tests/scoring.test.ts` ya cubre `scoreBand`; añadir un caso en los límites (74.99, 75, 84.99, 85).

### Ítem 2 — `FormatBadge` con tokens y traducciones (Sonnet; archivos: `components/dashboard/FormatBadge.tsx`, sus llamadores, `messages/*.json` solo si falta una clave)
- Hoy usa hex literales y etiquetas en español fijas (DESCRIPTIVO/AFECTIVO/COMBINADO).
- Reescribir sobre `components/ui/Badge` (`tone` por formato: descriptive → `success`, affective → `accent`, combined → `neutral`), aceptar `label: string` desde el llamador (que ya tiene `session.format.*` o `session.formats.*` — buscar la clave exacta con grep) y mantener tamaño/peso visual.
- Capturas antes/después en dashboard y lista de sesiones.

### Ítem 3 — Un solo tipo `SampleResult` (Fable)
- Canónico: `app/[locale]/app/sessions/[id]/results/types.ts`. Copias privadas en `components/results/SampleRadarChart.tsx` y `components/results/OwnerParticipantSection.tsx` (y comprobar `SampleDetailDialog.tsx`).
- Importar el canónico; si un componente necesita un subconjunto, usar `Pick<SampleResult, …>` en lugar de redeclarar. Asegurarse de que `isReference`, `scoreSd`, `masterCoffee` fluyen sin `!`.

### Ítem 4 — Strings en español fijos en `SampleRadarChart` → i18n (Fable)
- "Revelar", "Puntuación comunidad", "Sin datos afectivos registrados" → claves `results.reveal` (comprobar si ya existe en `results.table`/`results.detail` y reutilizar), `results.communityScore`, `results.noAffectiveData` en es/en, a través de la prop `t` existente del componente (extender `ResultsClient` y `results/page.tsx`).
- Grep de todo `components/results/` por literales con acentos o mayúsculas en español fuera de `t.` para no dejar otros.

### Ítem 5 — Baseline de lint a cero (Fable)
- Arreglar de raíz (sin `eslint-disable`):
  - `components/ui/IntensitySlider.tsx`: refs leídos en render / deps de `useEffect` (`commitFromClientX`) → mover a `useCallback` con deps correctas o a un `useRef` estable; verificar en el navegador que el slider sigue arrastrándose y que el commit al soltar no cambia (es el control más usado de la cata).
  - `app/[locale]/dev/page.tsx`, `app/actions/dev.ts`: lo que marque el linter (probablemente `setState` en efecto o imports no usados).
  - `components/results/SampleDetail.tsx` si sigue apareciendo.
- Salida de `npm run lint` antes y después en el mensaje de commit.

### Ítem 6 — README (Sonnet; archivo: `README.md`)
- "Dev Commands": añadir `npm test`, `npm run test:watch`; nota de que `npx prisma migrate dev` es solo para la DB de desarrollo/staging y `migrate deploy` para producción (remitir a `docs/LAUNCH-RUNBOOK.md` §2 y, si existe, `docs/ENVIRONMENTS.md`).
- "How to Use the App" → añadir un párrafo en *Session Leader* sobre la muestra de referencia y otro en *Participant* (ya documentado en `docs/CHANGELOG-reference-2026-09.md`; enlazar).

## 3. Verificación final
`npx tsc --noEmit` limpio; `npm run lint` → `✖ 0 problems`; `npm test` verde; capturas de FormatBadge y del radar; PR con la lista de ítems y cualquier diferencia visual inevitable.

## 4. Definición de hecho
- [ ] 6 commits, uno por ítem, cada uno verde.
- [ ] Lint a cero (habilita el job bloqueante de S2 P1.6).
- [ ] Memoria de proyecto: anotar que el baseline de lint ya no existe (varias memorias lo mencionan como "no arreglar de paso").
