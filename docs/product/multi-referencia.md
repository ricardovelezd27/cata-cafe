# Multi-referencia — "Referencia 1 / Referencia 2" (decisión de Ricardo, 2026-10-21)

## Caso
Una sesión arranca con una referencia (R1). A mitad de cata el grupo decide tomar otro café como
referencia. Hoy `setReferenceSample` **sustituye** R1: R1 queda con los 79.00 fijados de todos
pero deja de ser referencia (ancla falsa en el promedio, C-4 de la auditoría).

**Nuevo comportamiento:** las referencias se **acumulan**, no se sustituyen. R1 mantiene su
79.00 (nadie está obligado a re-puntuarla; si alguien quiere cambiar su nota, puede — el
bloqueo se libera para R1). La nueva pasa a ser **Referencia 2** y queda bloqueada en 79.00 como
lo estaba R1. Resultados muestra ambas marcadas y permite comparar contra una u otra.

## Modelo
- `SessionSample.referenceRank Int?` — `null` = no es referencia; `1`, `2`, … orden en que se
  nombraron. Único por sesión (`@@unique([sessionId, referenceRank])`). Migración aditiva
  (`ALTER TABLE session_samples ADD COLUMN "referenceRank" INTEGER`) + backfill
  `UPDATE session_samples s SET "referenceRank" = 1 FROM cupping_sessions c WHERE c."referenceSampleId" = s.id`.
- `CuppingSession.referenceSampleId` se conserva = **la referencia activa (la de mayor rango)**,
  para que todo lo existente (orden, pin, Δ por defecto, realtime) siga funcionando sin tocar el
  SQL ni `AggregateScore` (sigue siendo display-only: scoring, trigger y agregados no leen nada
  de esto — regla PRODUCT.md intacta).

## Reglas (lib/referenceRules.ts, puras y testeadas)
- `references(samples)` → lista ordenada por `referenceRank`; `activeReference` = última.
- **Pin:** solo la referencia **activa** está bloqueada (`isPinnedModule` + `pinReferenceAffective`
  en `upsertEvaluation` / `syncEvaluation` / re-pin de C2). Las anteriores conservan sus datos
  pinned pero **se desbloquean** (el catador puede cambiar su nota; si no toca nada, 79.00 queda).
- **Orden de cata:** `orderReferenceFirst` → todas las referencias primero, por rango (R1, R2,
  luego el resto por posición). `CupClient.applyReferenceOrder` igual.
- **Resultados:** `SampleResult.isReference` → `referenceRank: number | null`. Ranking, promedio
  de sesión y "Mejor muestra" excluyen **todas** las referencias (ancla = cualquiera con rango).
  Δ: `deltasVsReference(rows, referenceId)` se conserva; se añade un selector "Comparar con:
  R1 · R2" (estado del cliente, persistido en `localStorage` `cata_results_ref`, por defecto la
  activa) que alimenta los chips Δ del ranking, la tabla, el radar (polígono de la referencia
  elegida) y la matriz del propietario. Etiquetas: "Referencia 1", "Referencia 2" (i18n
  `results.referenceN` con `{n}` sustituido en cliente).
- **PDF / email / print:** `isReference` → etiqueta "· Referencia 1/2"; el resumen del
  participante y la ficha muestran Δ vs la activa y, si hay dos, una segunda columna Δ R1.

## Escrituras
- `setReferenceSample(sessionId, sampleId)` → si ya hay referencias y `sampleId` no es una de
  ellas: **asigna `referenceRank = max+1`** y actualiza `referenceSampleId` (no toca R1). Re-pin
  de C2 sobre la nueva. Si `sampleId` ya es referencia → no-op. `null` → quita **solo la activa**
  (rank max) y la activa pasa a ser la anterior; si no queda ninguna, `referenceSampleId = null`.
- Creación/duplicado: `referenceIdx` → rank 1 (sin cambios de UX en el asistente).
- `removeSessionSample` de una referencia → recomputa activa.

## UI
- Master panel: "Referencia" muestra "R1: A · R2: D (activa)" y el botón pasa a "Añadir
  referencia" cuando ya hay una; confirmación con el texto: "La referencia anterior conserva sus
  79.00; la nueva queda fijada."
- Cup: pestañas muestran "R1"/"R2" en el badge; el aviso de bloqueo solo en la activa.
- Waiting room: línea "Referencias: A (R1) · D (R2)".

## Fuera de alcance
Scoring, trigger, `AggregateScore`, `calcCommunityScore`: intactos. Máximo práctico 3
referencias (validar `rank <= 3`).

## Entrega
Un PR (rama `claude/s6-multi-reference`), migración aditiva + backfill, tests en
`tests/referenceRules.test.ts` y `tests/referenceDelta.test.ts`, `docs/flows.md` §1
"Reference sample" y CLAUDE.md actualizados. Orden de merge: después de #45 (ambos tocan
`CuppingSession`), con `migrate deploy` en la misma ventana.
