# S3 — Radar de tres polígonos: yo · referencia · grupo (+ Δ por atributo)

> **Cuándo:** SOLO si la cata de calibración de fin de mes valida el concepto de referencia
> (rellenar antes `docs/product/experimento-referencia-2026-09.md` §7 "Decisiones").
> **Dónde:** sesión nueva, rama desde `main` (o desde `staging` si S2 ya está hecho — entonces el flujo es dev → staging → prod).
> **Requiere de Ricardo:** una decisión de producto al inicio (§2) y un vistazo al resultado en el navegador.

---

## 1. Prompt (copiar y pegar)

```
Context: Café Sensible (read CLAUDE.md, DESIGN.md, and docs/prompts/S3-radar-reference-overlay.md — that file is the implementation plan; follow its phases). The session owner can mark ONE sample as the "Referencia" (CuppingSession.referenceSampleId, shipped 2026-09). Results already show a "Referencia" badge and a signed Δ of CVA totals against it (lib/referenceDelta.ts: pickDisplayedScore / deltasVsReference / formatSignedDelta). Standing product law in PRODUCT.md: "el puntaje necesita contexto" — every number ships with its comparison, display-only, the CVA formula is never mutated.

Goal: in the results "Gráfico" view, each sample's radar overlays THREE polygons — my evaluation, the reference sample, and the group mean — and the per-attribute delta table gains a "Δ ref" column, so a cupper sees where they match the reference, where the group agrees, and where the master and the group diverge.

Facts (verified 2026-09-22, re-check quickly):
- components/results/SampleRadarChart.tsx renders two Recharts <Radar> series ("mine" solid, "community" dashed) from `radarData` rows `{ subject, mine?, community? }` built over AFFECTIVE_ATTRIBUTES (lib/constants.ts, 8 attrs with Spanish `label`). `mine` reads `affData[attr.id + "_final"] ?? affData[attr.id]` with an unset→5 fallback used ONLY for drawing; the delta table is built from raw values so the fallback never fakes a delta. `community` reads `sample.aggregateScore.attrAverages[attr.label]` — keyed by the SPANISH LABEL, a contract shared with the SQL trigger recompute_aggregate_score (prisma/sql/rls_and_triggers.sql PHASE 6) and computeGroupAggregate (lib/scoring.ts).
- The chart keeps a private copy of SampleResult instead of importing app/[locale]/app/sessions/[id]/results/types.ts; OwnerParticipantSection does the same. If S4 already ran, the copies are gone.
- Colours: components/results/chartColors.ts (`ChartColors { mine, community, grid, axisText }`, CSS custom properties read at runtime with hex fallbacks — the ONE sanctioned hex exception). A third series needs a new role token in app/globals.css (@theme) + DESIGN.md, never an inline hex.
- Data availability: the reference sample's `aggregateScore.attrAverages` (group) and the viewer's own affective data for the reference sample are already in `session.samples` passed to ResultsClient — no new query, no trigger change.
- results.help.grafico (messages/es.json, en.json) describes two series and must be rewritten. SampleRadarChart still has hardcoded Spanish strings ("Revelar", "Puntuación comunidad", "Sin datos afectivos registrados") unless S4 ran.
- Descriptive-format sessions have no affective data: the radar already handles "no data"; the third series must degrade the same way.

Product decision to confirm with Ricardo BEFORE coding (AskUserQuestion, one question): what the "reference" polygon means in a GROUP session — (a) the group's mean profile of the reference sample (the shared anchor everyone tasted, recommended) or (b) the master's own evaluation of the reference sample (the master's intent, only available if the master submitted). In SOLO sessions it is always the viewer's own profile of the reference sample. Default to (a) if Ricardo does not answer within the session.

Deliver the phases in docs/prompts/S3-radar-reference-overlay.md §3 in order; delegate i18n + docs to Sonnet with explicit file ownership; forbid bare `git stash`; do not touch lib/scoring.ts, the SQL trigger, AggregateScore, or anything under app/actions.
```

---

## 2. Decisión de producto previa

| Opción | Qué representa el polígono "referencia" en sesión grupal | Ventaja | Desventaja |
|---|---|---|---|
| **(a) Media del grupo sobre la muestra de referencia** (recomendada) | Lo que el grupo percibió del anclaje común | Siempre disponible una vez hay evaluaciones; coherente con el Δ actual (usa puntaje comunitario) | No muestra la "intención" del maestro |
| (b) Evaluación del maestro sobre la referencia | El criterio profesional | Hace visible maestro vs grupo (§9 del documento de Kim) | Solo existe si el maestro puntuó; expone la evaluación individual del maestro a todos (hoy el drill-down por catador es solo owner) |

En sesiones individuales solo existe una opción: mi propio perfil de la referencia. Si más adelante se quiere (b), se puede añadir como cuarto polígono opcional para el owner, no ahora.

## 3. Fases

### Fase 1 — Helper puro + tests (Fable)

`lib/attributeDelta.ts`:
```ts
export type Profile = Record<string, number>;               // key = attr.label (Spanish)
export function profileFromAffective(data: Record<string, unknown> | null | undefined): Profile | null
  // reads `${attr.id}_final` ?? attr.id per AFFECTIVE_ATTRIBUTES; returns null unless hasAffectiveData
export function referenceProfileFor(args: {
  isGroup: boolean; showCommunity: boolean;
  referenceSample: { affective; combined; aggregateScore?: { attrAverages: Profile } | null } | null;
  format: "affective" | "combined" | "descriptive";
}): Profile | null
  // group && showCommunity → aggregateScore.attrAverages (if 8 keys present) else null
  // otherwise → profileFromAffective(format === "affective" ? affective : combined)
export function attributeDeltas(mine: Profile | null, reference: Profile | null): Record<string, number | null>
  // per label; null when either side is missing that attribute
```
`tests/attributeDelta.test.ts`: fixtures con `AFFECTIVE_ATTRIBUTES`; casos: sin referencia; referencia sin datos; grupo con attrAverages parciales (7 de 8 claves → null); solo con datos; formato descriptivo → null; deltas con signo.

### Fase 2 — Token de color y tipos (Fable)

- `app/globals.css` `@theme`: nuevo rol `--color-tertiary` / `--color-tertiary-container` / `--color-on-tertiary-container` (MD3 tertiary; elegir un tono que contraste con verde primary y terracota secondary en claro y oscuro; documentar el hex en DESIGN.md como token, no en componentes).
- `components/results/chartColors.ts`: `ChartColors.reference` ← `--color-tertiary` con fallback hex idéntico al token.
- `SampleRadarChart.tsx`: importar `SampleResult` desde `results/types.ts` (eliminar la copia privada; si S4 no ha corrido, hacerlo aquí).

### Fase 3 — Radar (Fable)

- Props nuevas en `SampleRadarChart`: `referenceProfile?: Profile | null`, `referenceLabel?: string` (etiqueta de la muestra, p. ej. "C"), `t.reference: string` ("Referencia"), `t.deltaRef: string`.
- `radarData` filas `{ subject, mine?, community?, reference? }`; tercer `<Radar dataKey="reference" stroke={colors.reference} fill="none" strokeWidth={2} strokeDasharray="2 4">` (punteado fino, sin relleno, para distinguirlo del `community` discontinuo y del `mine` sólido).
- La tarjeta de la **propia muestra de referencia** no dibuja el tercer polígono (sería idéntico a uno de los otros dos) y muestra el badge existente.
- `<Legend>` con tres entradas cuando existe `referenceProfile`; el `<Tooltip>` muestra los tres valores.
- Tabla de deltas: columna "Δ ref" (`attributeDeltas(mine, reference)`), formateada con `formatSignedDelta(d, 1)`, `aria-label` con el texto explicativo; la columna existe solo cuando hay referencia.
- Sin datos afectivos propios (descriptivo, o sin evaluar): igual que hoy (sin cambios).

### Fase 4 — Cableado en ResultsClient (Fable)

- Calcular una vez `referenceProfile = referenceProfileFor({...})` a partir de `referenceSample` (ya existe `referenceId`/`referenceSample` en `ResultsClient`).
- Pasar `referenceProfile`, `referenceLabel`, traducciones al mapa de tarjetas de la vista Gráfico.
- `ResumenTab` "Mi desempeño": opcional, añadir una línea "Atributo donde más me alejo de la referencia: <label> (Δ ±x.x)" usando `attributeDeltas` sobre el promedio de mis perfiles — **solo si** Ricardo lo pide; por defecto no.

### Fase 5 — i18n + docs (Sonnet; archivos: messages/es.json, messages/en.json, PRODUCT.md, docs/flows.md)

- `results.reference` "Referencia", `results.deltaRef` "Δ ref", `results.deltaRefAria` "Diferencia por atributo entre tu evaluación y la referencia; positiva si puntuaste más alto", `results.legendReference` "Referencia ({label})".
- `results.help.grafico.body` reescrito: tres series (mía sólida, referencia punteada fina, grupo discontinua), qué significa cada distancia, y que la referencia en grupo es la media del grupo sobre la muestra de referencia (según decisión §2).
- PRODUCT.md `### Shipped` línea fechada; `docs/flows.md` §5 nota.

### Fase 6 — Verificación

- `npm test` (nuevos tests), `npx tsc --noEmit`, `npm run lint` sin hallazgos nuevos.
- Navegador (con `seed:test`): sesión grupal cerrada con referencia → tarjeta de una muestra no-referencia muestra tres polígonos, leyenda de tres, tabla con "Δ ref"; tarjeta de la referencia muestra dos; sesión solo → tres polígonos con "referencia" = mi perfil de la referencia; sesión descriptiva → sin radar afectivo, sin errores; sin referencia → idéntico a hoy. Modo oscuro: el tercer color se distingue. Captura de pantalla de cada caso en el informe.

## 4. Fuera de alcance

Cambios de scoring, trigger o `AggregateScore`; PDF (el radar no está en el PDF); referencia por atributo; polígono del maestro (opción b).

## 5. Definición de hecho

- [ ] Helper + tests; token; radar con tres series y tabla Δ ref; i18n es/en; help reescrito; docs.
- [ ] Sin cambios en scoring ni en SQL. PR con capturas. Memoria de proyecto actualizada.
