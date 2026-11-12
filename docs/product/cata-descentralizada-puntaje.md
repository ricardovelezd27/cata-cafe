# Puntaje de la cata descentralizada — decisión de producto y regla de cálculo

- **Decidido por:** Ricardo, 2026-11-12 (versión 2, la que vale). Sustituye a la decisión
  S8-04 ("sin descuentos con menos de cinco tazas").
- **Estado:** especificado, NO construido. Kim no lo ha validado.
- **Para quién es este documento:** la sesión que lo implemente y quien revise su trabajo.
- **Historia de la decisión:** el mismo día se consideró y se descartó una regla proporcional
  pura (20 × defectuosas ÷ tazas), porque con pocas tazas descontaba 15 o 20 puntos por una
  sola taza. Ricardo: "una sola taza no puede costar 20 o 30 puntos; hay que quedarse cerca
  de lo que sugiere el CVA". Si un documento o un comentario habla de −15 o −20 por una taza,
  es de esa versión y está obsoleto.

## 1. La idea

El CVA descuenta 2 puntos por taza no uniforme y 4 por taza defectuosa, sobre cinco tazas que
cata una persona. Café Sensible es una cata descentralizada y de aprendizaje: cada persona
tiene una o dos tazas, y un mismo café lo catan personas distintas, en lugares y momentos
distintos.

Dos principios:

1. **Quien cata ve el descuento del CVA, tal cual.** 2 puntos por taza no uniforme, 4 por taza
   defectuosa, 6 si es las dos cosas. Nunca más de 6 por taza. Es lo que se enseña y lo que se
   espera ver; cualquier otra cifra confunde.
2. **Cuantas más tazas se catan de un café, menos pesa una taza mala.** Con más de cinco tazas
   entre todos, el descuento se reparte. Con cinco o menos, no se agranda.

No es CVA estricto, pero se queda cerca. El número deja de llamarse "puntaje CVA" (§6).

## 2. La regla

Base, igual que el CVA: `B = 0,65625 × (suma de las 8 secciones afectivas) + 52,75`.
Todo en 5 da 79; todo en 9 da 100.

```
descuento = (4 × tazas defectuosas + 2 × tazas no uniformes) × 5 ÷ máx(5, tazas)
puntaje   = B − descuento        (redondeo a 0,25 con roundToQuarter, tope entre 0 y 100)
```

- Con **cinco tazas o menos** el factor es 1: descuento plano del CVA, 4 y 2 por taza.
- Con **más de cinco tazas** el descuento se reparte: 10 tazas, la mitad; 40 tazas, un octavo.
- La no uniformidad solo existe con 2 tazas o más. Con 1 taza no se marca ni se descuenta.
- Una taza defectuosa también es no uniforme (regla del CVA), solo con 2 tazas o más. La app
  ya lo hace al marcar. Por eso una taza defectuosa cuesta 6 con 2+ tazas y 4 con 1 taza.
- Tope: 6 puntos por taza. Dos tazas defectuosas de dos cuestan 12; cinco de cinco, 30, como
  en un formulario CVA.
- Una taza defectuosa cuenta solo si lleva tipo de defecto: mohoso, fenólico o papa (§5.3).

## 3. Tres ámbitos, la misma fórmula

Lo único que cambia es qué tazas se cuentan.

| Ámbito | Tazas que cuenta | B | Cuándo cambia |
|---|---|---|---|
| **Mi puntaje** | mis tazas de esa muestra (nunca más de 5) | mis 8 secciones | nunca después de enviar/cerrar |
| **Puntaje de la sesión** (del grupo) | las de todos los catadores incluidos en esa muestra | promedio de la suma de secciones de los incluidos | nunca después de cerrar |
| **Puntaje del café** (acumulado, en su perfil) | todas las tazas de ese café en todas las sesiones que cuentan (§5.2) | promedio de la suma de secciones de las evaluaciones que cuentan | cada vez que se cierra una sesión con ese café |

- **Mi puntaje es siempre el descuento plano del CVA**, porque una persona nunca tiene más de
  cinco tazas. En una cata individual, mi puntaje y el de mi sesión son el mismo número.
- **En grupo**, cada persona ve su propio descuento plano; el puntaje de la sesión reparte los
  descuentos cuando el grupo junta más de cinco tazas.
- **El puntaje del café** vive en su perfil y pesa cada defecto según todas las tazas catadas
  en la vida de ese café.
- Una sesión cerrada es el registro de ese día: ningún puntaje pasado se retoca. Solo se mueve
  el perfil del café.

**Ejemplo**

| Momento | Tazas | Marcadas | Descuento |
|---|---|---|---|
| Cato solo: 2 tazas, 1 defectuosa | 2 | 1 | −6 (mi puntaje y el de mi sesión) |
| Perfil del café justo después | 2 | 1 | −6 |
| Después, 4 personas más catan 2 tazas limpias cada una | 10 | 1 | −3 en el perfil del café |
| Con 40 tazas en total | 40 | 1 | −0,75 en el perfil del café |

Mi sesión sigue mostrando −6. El perfil del café muestra el número repartido y el recuento:
"1 taza defectuosa de 40 catadas, encontrada por 1 persona", por tipo de defecto.

**Comprobaciones que deben quedar como pruebas** (TypeScript y, donde aplique, trigger real con
`npm run test:db`)

| Caso | Resultado |
|---|---|
| 1 persona, 5 tazas, 1 defectuosa | −6. Igual que el CVA |
| 1 persona, 2 tazas, 1 defectuosa | −6 |
| 1 persona, 2 tazas, las 2 defectuosas | −12 |
| 1 persona, 1 taza, defectuosa | −4; no existe uniformidad |
| 1 persona, 3 tazas, 1 solo no uniforme | −2 |
| 2 personas × 2 tazas (4 en total), 1 defectuosa | quien la marcó −6; sesión −6 (4 tazas: sin repartir) |
| 4 personas × 2 tazas (8 en total), 1 defectuosa | quien la marcó −6; sesión −3,75 (6 × 5/8) |
| 2 personas × 5 tazas (10 en total), 1 solo no uniforme | quien la marcó −2; sesión −1 |
| Café con 3 sesiones cerradas, 10 tazas en total, 1 defectuosa | perfil −3; cada sesión conserva su número |
| Sesión con un catador excluido | sus tazas y sus secciones fuera de sesión y de café |
| Taza defectuosa sin tipo (dato nuevo) | no descuenta |
| Cualquier caso | el descuento por taza marcada nunca pasa de 6 |

## 4. Qué hace la app hoy, y qué hizo S8-04

Comprobado en el código (`main` = `6dbf821`) y en producción (solo lectura, 2026-11-12).

| | Antes de S8 | Hoy (S8-04 + PHASE 23 paso 1) | Regla nueva |
|---|---|---|---|
| Individual, menos de 5 tazas | sin descuento | sin descuento | −4 / −2 por taza |
| Individual, 5 tazas | −4 / −2 por taza | −4 / −2 por taza | igual |
| Sesión guardada (trigger), menos de 5 tazas por persona | 10 × no unif ÷ tazas del grupo + 30 × def ÷ tazas del grupo | sin descuento | plano hasta 5 tazas del grupo, repartido después |
| Sesión en pantalla (TypeScript), menos de 5 | sin descuento | sin descuento | igual que el guardado |
| Café (perfil) | promedio de lo guardado por sesión | igual | acumulado propio, §3 |

- **S8-04 corrigió en la dirección equivocada para este producto.** Había una diferencia real
  (la página mostraba 80,00 y la base guardaba 77,50) y se cerró quitando el descuento en los
  dos lados. Con el 96 % de lo catado por debajo de cinco tazas, eso significa que un defecto
  casi nunca cuesta nada, ni a quien cata ni al café.
- **El trigger antiguo tampoco era la regla nueva.** Con pocas tazas agrandaba el descuento
  (1 defectuosa de 2 tazas del grupo: 20 puntos). Y como una taza defectuosa se marca también
  como no uniforme, cobraba 40 ÷ tazas: 8 puntos por 1 de 5, más que el CVA (6). Eso sigue
  pasando hoy con cinco tazas: el individual descuenta 6 y la sesión 8. Las pruebas no lo ven
  porque sus datos marcan "defectuosa" sin "no uniforme" (`tests/scoringConsistency.test.ts`).
  `CLAUDE.md` dice que las dos listas no se solapan; el código y los datos dicen lo contrario.
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

## 5. Decisiones

**Ya decididas por Ricardo (2026-11-12)**

- La regla de §2, con tope de 6 por taza (dos tazas defectuosas de dos = 12).
- Una sola taza defectuosa nunca cuesta 20 ni 30: cuesta 4.
- Ningún puntaje pasado cambia. Solo se mueve el perfil del café.

**A confirmar con Ricardo antes de construir** (la sesión que implemente pregunta con
AskUserQuestion, con estas recomendaciones)

1. **Recalcular lo guardado.** "Ningún puntaje pasado cambia" deja los puntajes individuales y
   de sesión de las catas cerradas como están, calculados con las reglas viejas. *Recomendación:*
   no recalcular nada; la regla nueva vale para lo que se envíe desde que se despliegue. El
   perfil del café sí se calcula con la regla nueva sobre todas sus tazas, porque es un
   cálculo nuevo, no un dato guardado. Antes de construir, sacar la lista de las 47 muestras
   con marcas (valor guardado y valor que daría la regla nueva) para que Ricardo vea la
   diferencia y lo confirme.
2. **Qué catas cuentan para el puntaje del café.** *Recomendación:* la regla que ya usa el
   perfil (`filterCoffeeSamples`): sesiones cerradas, muestra revelada, sin excluidos.
3. **Tipo de defecto.** Obligatorio de aquí en adelante, por taza. *Recomendación para lo
   antiguo:* las 22 tazas ya marcadas cuentan en el recuento del café; si su evaluación no
   tiene tipo, aparecen como "sin especificar". No se pierde ningún defecto ya registrado.
4. **"Catar ahora" (impresión rápida).** *Recomendación:* sus secciones afectivas no entran en
   el B del café; sus tazas y sus defectos sí entran en el recuento y en el descuento.
5. **Una voz por persona.** *Recomendación:* en el B del café cada evaluación cuenta una vez,
   tenga una taza o cinco.
6. **Tazas por persona dentro de una sesión.** Hoy son las de la sesión, iguales para todos.
   *Recomendación:* primera versión así. El número de tazas se guarda en la evaluación (el
   trigger lo necesita, y deja la puerta abierta a tazas distintas por persona después).
7. **"Indicativo".** *Recomendación:* una sola definición: menos de 5 tazas sumadas en ese
   ámbito, para el ranking y el perfil del café.
8. **Nombre.** "Puntaje Café Sensible (base CVA)" en resultados, informes, PDF, CSV y correos.

## 6. Lo que NO hay que hacer

- **PHASE 23 paso 2 queda CANCELADO.** Subiría 54 puntajes guardados. El mensaje a Kim sobre
  "54 puntajes que suben" no se envía.
- No ejecutar `scripts/resync-low-cup-history.ts`.
- No cambiar la marca por taza que ya existe: cambian los cálculos y se añade el tipo por taza.
- El puntaje del café no lo lee ni lo escribe el trigger de sesión: es otro cálculo.
- No construir la regla proporcional pura (ver "Historia de la decisión").

## 7. Límites conocidos de la primera versión

- Un café cambia con el tiempo: el acumulado mezcla tuestes, cosechas y años. Más adelante se
  puede separar por cosecha (el café ya la registra).
- Un café duplicado es otro café: su historia empieza de cero.
- En grupo, la suma de lo que ve cada persona no coincide con el puntaje de la sesión cuando
  hay más de cinco tazas (cada persona ve −6, la sesión −3,75). Es deliberado; la pantalla de
  resultados debe decirlo en una línea: "Entre todos se cataron 8 tazas: el descuento del
  grupo se reparte".
- Un molino sucio en casa puede dar una taza "defectuosa" que no es del café. Por eso el tipo
  de defecto es obligatorio y el perfil del café muestra cuántas personas distintas lo
  encontraron.

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
