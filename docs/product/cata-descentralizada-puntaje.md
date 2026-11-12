# Puntaje de la cata descentralizada — decisión de producto y regla de cálculo

- **Decidido por:** Ricardo, 2026-11-12. Sustituye a la decisión S8-04 ("sin descuentos con
  menos de cinco tazas") y corrige la regla individual de la respuesta A1 simulada
  (`docs/product/kim-flows-2026-11/respuestas-kim-2026-11.md`), que descontaba 4 y 2 puntos
  fijos por taza.
- **Estado:** especificado, NO construido. Kim no lo ha validado.
- **Para quién es este documento:** la sesión que lo implemente y quien revise su trabajo.

## 1. La idea

El CVA descuenta por tazas no uniformes o defectuosas cuando UNA persona cata CINCO tazas de
un café. Café Sensible es una cata descentralizada y de aprendizaje: cada persona tiene una o
dos tazas, y un mismo café lo catan personas distintas, en lugares y momentos distintos. Las
tazas las pone la gente, entre todos.

No es CVA estricto. Es una simplificación deliberada para que más gente, más variada, cate más
cafés. Por eso el número deja de llamarse "puntaje CVA" (§6).

## 2. Una fórmula, proporcional a las tazas

Base, igual que el CVA: `B = 0,65625 × (suma de las 8 secciones afectivas) + 52,75`.
Todo en 5 da 79; todo en 9 da 100.

```
descuento = 20 × (tazas defectuosas ÷ tazas) + 10 × (tazas no uniformes ÷ tazas)
puntaje   = B − descuento        (redondeo a 0,25 con roundToQuarter, tope entre 0 y 100)
```

Las constantes 4 y 2 del CVA son 20 y 10 repartidas entre cinco tazas. Al escribirlas como
proporción, la misma parte de tazas malas descuenta lo mismo con cualquier número de tazas.
Con cinco tazas da exactamente el CVA.

- La no uniformidad solo existe con 2 tazas o más. Con 1 taza no se marca ni se descuenta.
- Una taza defectuosa también es no uniforme (regla del CVA), solo con 2 tazas o más. La app
  ya lo hace al marcar.
- Una taza defectuosa cuenta solo si lleva tipo de defecto: mohoso, fenólico o papa (§5.3).

| Tazas | 1 defectuosa cuesta |
|---|---|
| 5 | 6 (20×1/5 + 10×1/5), igual que el CVA |
| 3 | 10 |
| 2 | 15 |
| 1 | 20 (sin uniformidad) |

## 3. Tres ámbitos, la misma fórmula

Lo único que cambia es qué tazas se cuentan.

| Ámbito | Tazas que cuenta | B | Cuándo cambia |
|---|---|---|---|
| **Mi puntaje** (inmediato) | mis tazas de esa muestra | mis 8 secciones | nunca después de enviar/cerrar |
| **Puntaje de la sesión** (inmediato, del grupo) | las de todos los catadores incluidos en esa muestra | promedio de la suma de secciones de los incluidos | nunca después de cerrar |
| **Puntaje del café** (acumulado, en su perfil) | todas las tazas de ese café en todas las sesiones que cuentan (§5.2) | promedio de la suma de secciones de las evaluaciones que cuentan | cada vez que se cierra una sesión con ese café |

- Los dos primeros son el **puntaje inmediato**: lo que se ve durante la experiencia de cata y
  en sus resultados. Una sesión cerrada es el registro de ese día y no se retoca.
- El tercero es el **puntaje del café**: vive en el perfil del café y pesa cada defecto según
  todas las tazas catadas en la vida de ese café. Cuantas más tazas, menos pesa una taza mala.
- Una persona sola es un grupo de uno: su puntaje y el de su sesión coinciden.
- Cuando todos en una sesión tienen las mismas tazas (como hoy), el puntaje de la sesión es el
  promedio de los puntajes individuales antes de redondear.

**Ejemplo**

| Momento | Tazas | Defectuosas | Descuento |
|---|---|---|---|
| Cato solo: 2 tazas, 1 defectuosa | 2 | 1 | −15 (mi puntaje y el de mi sesión) |
| Perfil del café justo después | 2 | 1 | −15, "indicativo" |
| Después, 4 personas más catan 2 tazas limpias cada una | 10 | 1 | −3 en el perfil del café |
| Con 40 tazas en total | 40 | 1 | −0,75 en el perfil del café |

Mi sesión sigue mostrando −15. El perfil del café muestra el número diluido y el recuento:
"1 taza defectuosa de 40 catadas, encontrada por 1 persona", por tipo de defecto.

**Comprobaciones que deben quedar como pruebas** (TypeScript y, donde aplique, trigger real con
`npm run test:db`)

| Caso | Resultado |
|---|---|
| 1 persona, 5 tazas, 1 defectuosa | −6 individual y de sesión. Igual que el CVA |
| 1 persona, 2 tazas, 1 defectuosa | −15 individual y de sesión |
| 1 persona, 1 taza, defectuosa | −20; no existe uniformidad |
| 2 personas × 5 tazas, 1 taza solo no uniforme | quien la marcó −2; sesión −1 |
| 4 personas × 2 tazas, 1 defectuosa | quien la marcó −15; sesión −3,75 (20×1/8 + 10×1/8) |
| Café con 3 sesiones cerradas, 10 tazas en total, 1 defectuosa | perfil −3; cada sesión conserva su número |
| Sesión con un catador excluido | sus tazas y sus secciones fuera de sesión y de café |
| Taza defectuosa sin tipo (dato nuevo) | no descuenta |

## 4. Qué hace la app hoy, y qué hizo S8-04

Comprobado en el código (`main` = `4dce4d9`) y en producción (solo lectura, 2026-11-12).

| | Antes de S8 | Hoy (S8-04 + PHASE 23 paso 1) | Regla nueva |
|---|---|---|---|
| Individual, menos de 5 tazas | sin descuento | sin descuento | proporcional a sus tazas |
| Individual, 5 tazas | −4 / −2 por taza | −4 / −2 por taza | igual (20/5, 10/5) |
| Sesión guardada (trigger), menos de 5 tazas | descontaba: 10 × no unif ÷ tazas + 30 × def ÷ tazas | sin descuento | 20 × def ÷ tazas + 10 × no unif ÷ tazas |
| Sesión en pantalla (TypeScript), menos de 5 | sin descuento | sin descuento | igual que el guardado |
| Café (perfil) | promedio de lo guardado por sesión | igual | acumulado propio, §3 |

- **S8-04 corrigió en la dirección equivocada para este producto.** Había una diferencia real
  (la página mostraba 80,00 y la base guardaba 77,50) y se cerró dando la razón a la página.
  La cata descentralizada estaba del otro lado: el trigger antiguo ya descontaba según las
  tazas del grupo.
- **El trigger antiguo tampoco era la regla nueva.** Como una taza defectuosa se marca también
  como no uniforme, cobraba 40 ÷ tazas por taza defectuosa: 8 puntos por 1 de 5, más que el
  CVA (6). Sigue pasando hoy con cinco tazas: el individual descuenta 6 y la sesión 8. Las
  pruebas no lo ven porque sus datos marcan "defectuosa" sin "no uniforme"
  (`tests/scoringConsistency.test.ts`). `CLAUDE.md` dice que las dos listas no se solapan; el
  código y los datos dicen lo contrario (las 22 tazas defectuosas de producción están en las
  dos listas).
- **El catador nunca vio que un defecto le costara puntos con menos de cinco tazas.**

Producción (1.081 evaluaciones enviadas, sin las descriptivas):

- 309 con 1 taza, 664 con 2, 60 con 3, 48 con 5. **El 96 % tiene menos de cinco tazas.**
- 22 tazas defectuosas, todas también no uniformes. 20 evaluaciones con alguna defectuosa
  (19 con menos de cinco tazas), 60 con alguna no uniforme (54). 47 muestras con marcas.
- Las listas de tazas no tienen la longitud de las tazas de la sesión en 1.013 de 1.081
  evaluaciones: **las tazas de una persona no se pueden leer de la lista**; hoy salen de
  `cupsPerSample` de la sesión.
- El tipo de defecto hoy es una lista por evaluación (`defecto_tipo`), no por taza, y no
  condiciona el descuento.
- Desde PHASE 23 paso 1 (2026-11-11) no se ha enviado ninguna evaluación con marcas en
  sesiones de menos de cinco tazas. Lo guardado de antes sigue como lo dejó el trigger antiguo.

## 5. Decisiones a confirmar con Ricardo antes de construir

La sesión que implemente las pregunta con AskUserQuestion, con estas recomendaciones.

1. **¿Cambia alguna vez mi puntaje pasado?** *Recomendación:* no. Solo se mueve el perfil del
   café.
2. **Qué catas cuentan para el puntaje del café.** *Recomendación:* la regla que ya usa el
   perfil (`filterCoffeeSamples`): sesiones cerradas, muestra revelada, sin excluidos.
3. **Tipo de defecto.** Obligatorio de aquí en adelante, por taza. *Recomendación para lo
   antiguo:* las 22 tazas ya marcadas cuentan si su evaluación tiene algún tipo en
   `defecto_tipo`; si no, cuentan como "sin especificar". No se pierde ningún defecto ya
   registrado.
4. **"Catar ahora" (impresión rápida).** *Recomendación:* sus secciones afectivas no entran en
   el B del café; sus tazas y sus defectos sí entran en el recuento y en el descuento.
5. **Una voz por persona.** *Recomendación:* en el B del café cada evaluación cuenta una vez,
   tenga una taza o cinco.
6. **Una sola taza defectuosa.** *Recomendación:* −20 (solo el defecto). No se cobra una
   no uniformidad que no se pudo observar.
7. **Tazas por persona dentro de una sesión.** Hoy son las de la sesión, iguales para todos.
   *Recomendación:* primera versión así. El número de tazas se guarda en la evaluación (el
   trigger lo necesita, y deja la puerta abierta a tazas distintas por persona después).
8. **"Indicativo".** *Recomendación:* una sola definición para etiqueta, promedio y recuento:
   menos de 5 tazas sumadas en ese ámbito.
9. **Recalcular lo guardado.** *Recomendación:* primero una lista de las 47 muestras con el
   valor de hoy y el nuevo, en una ejecución de prueba que no guarda nada. Ricardo decide con
   la lista delante. Los puntajes individuales de sesiones cerradas no se tocan sin esa
   decisión.
10. **Nombre.** "Puntaje Café Sensible (base CVA)" en resultados, informes, PDF, CSV y correos.

## 6. Lo que NO hay que hacer

- **PHASE 23 paso 2 queda CANCELADO.** Subiría 54 puntajes quitando un descuento que la regla
  nueva mantiene. El mensaje a Kim sobre "54 puntajes que suben" no se envía.
- No ejecutar `scripts/resync-low-cup-history.ts` con la regla de S8-04.
- No cambiar la marca por taza que ya existe: cambian los cálculos y se añade el tipo por taza.
- El puntaje del café no lo lee ni lo escribe el trigger de sesión: es otro cálculo.

## 7. Límites conocidos de la primera versión

- Un café cambia con el tiempo: el acumulado mezcla tuestes, cosechas y años. Más adelante se
  puede separar por cosecha (el café ya la registra).
- Un café duplicado es otro café: su historia empieza de cero.
- Con pocas tazas cada taza pesa mucho (1 de 1 = −20). Un molino sucio en casa hunde el
  puntaje de esa persona. Por eso el tipo de defecto es obligatorio, el perfil del café muestra
  cuántas personas distintas encontraron el defecto, y todo lo que tenga menos de 5 tazas
  lleva "indicativo".

## 8. Dónde vive el cálculo hoy

- `lib/scoring.ts`: `MIN_CUPS_FOR_PENALTIES`, `penaltiesApply`, `calcIndividualBreakdown`,
  `computeGroupAggregate`, `calcCommunityScore`, `roundToQuarter`, `scoreBand`,
  `scoreToCategory`.
- `lib/evaluation.ts`: `computeEvaluationDerived` (`rawScore` = B sin descuentos;
  `individualScore` con ellos), `cupFlags` en `lib/validate.ts`.
- `prisma/sql/rls_and_triggers.sql`, PHASE 23: `recompute_aggregate_score()`. Cambiarlo es una
  PHASE nueva con su ejecución de prueba, aplicada a mano en Supabase con el visto bueno de
  Ricardo.
- Formularios: `components/cupping/AffectiveForm.tsx`, `CombinedForm.tsx`,
  `components/ui/CupToggleGrid.tsx` (la sección de tazas se oculta con menos de 2 tazas: con 1
  taza hoy no se puede marcar un defecto).
- Perfil del café: `lib/coffees/filterCoffeeSamples.ts`, `loadCoffeeAggregateSamples`,
  `app/[locale]/app/coffees/[id]/page.tsx`, `/api/coffees/[id]/ficha`.
- Quién lee estos números: resultados (`results/page.tsx`, `ResumenTab`, `ScoreTable`,
  `SampleDetail`, `ScoreBreakdownPanel`, `OwnerParticipantSection`), informes
  (`lib/reports/ranking.ts`, `fichaTecnica.ts` (repite la fórmula 10/30), `participantSummary.ts`,
  `resultsCsv.ts`), PDF (`lib/pdf/cvaFormData.ts`), correo de cierre, historial
  (`lib/coffeeHistory.ts`, `historySnapshot.ts`, `historyRules.ts`), analítica
  (`lib/analytics/queries.ts`).
- Pruebas: `tests/scoring.test.ts`, `tests/scoringConsistency.test.ts` (copia de la aritmética
  del trigger: cambia en el mismo cambio), `tests/db/aggregate.dbtest.ts` (trigger real).
