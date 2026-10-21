# Formulario de cata SCA 2004 ("el formulario clásico") — memo de especificación

> **Estado:** memo solamente, **no se construye nada**. Decisión de Ricardo, 2026-10-21.
> **Compuerta:** la conversación de Kim con Bruno (formador de Q-graders en Brasil, detractor de CVA).
> Hasta que Kim la haya tenido, este documento es material de preparación, no un compromiso de roadmap.
> **Alcance de código:** `lib/scoring.ts`, el trigger SQL `trg_recompute_aggregate` y `AggregateScore`
> **no se tocan** en este trabajo. Lo que el memo propone sobre ellos es para una fase futura, con su propia revisión.
>
> Marcador **⚑** = decisión de producto abierta o pregunta sin resolver.

---

## 0. Contexto

El 2026-10-15 Kim reportó que muchos catadores rechazan CVA y siguen usando la hoja antigua
(la de Q Grader: Fragrance/Aroma, Flavor, Aftertaste, Acidity, Body, Balance, Uniformity,
Clean Cup, Sweetness, Overall, Defects; escala 6–10 en pasos de 0,25). La pregunta de fondo
es si Cata Café debería ofrecer ese formulario como un cuarto formato de sesión, para no
perder a quienes no migran a CVA.

Hecho que ayuda a situarlo: el SCA adoptó oficialmente los estándares CVA en noviembre de 2024 y
estos reemplazan al protocolo y formulario de 2004
([Daily Coffee News](https://dailycoffeenews.com/2024/11/05/sca-officially-adopts-new-cupping-forms-and-standards/)).
O sea: el formulario clásico está **superado oficialmente pero sigue en uso de campo**. Eso es
exactamente lo que Kim describe.

---

## 1. El formulario SCA 2004 — campos y puntuación (verificado)

### 1.1 Fuentes y procedencia ⚑

| Fuente | Qué se verificó |
|---|---|
| Texto del protocolo "Specialty Coffee Association of America Cupping Protocols", *Cupping Committee April 2005* (PDF alojado por [Atlantic Specialty Coffee](https://atlanticspecialtycoffee.com/wp-content/uploads/SCAA-Cupping-Protocols-2005.pdf); los metadatos del archivo dicen "June 2003-Revised Cupping Protocol") | Lista de atributos, escala, procedimiento por pasos, reglas de puntos por taza, definición de taint/fault, cálculo de Total y Final, tabla de clasificación. **Es la fuente primaria de todo lo de esta sección.** |
| Hoja en blanco "SCAA Cupping Form" ([PDF](https://atlanticspecialtycoffee.com/wp-content/uploads/SCAA-Official-Cupping-Form.pdf)) | Disposición de campos: escalas 6–10, dry/break/wet, intensidad de acidez, nivel de cuerpo, bloque *Defects (subtract) Taint=2 / Fault=4 · # cups · Intensity · X=*, *Total Score*, *Final Score*. |
| Explicaciones secundarias (Speciality Arabica, Coffee Strategies, Royal NY) | Solo como contraste; ninguna aporta la aritmética de defectos. Descartadas como evidencia. |

⚑ **Procedencia del "2004":** la copia que pude leer está fechada abril 2005 (el SCA la cita como
"protocolo de 2004"). Existen además revisiones de 2009 y 2015 (diciembre) en copias de terceros que no
pude leer. Antes de implementar, Kim/Bruno deben confirmar **qué hoja exacta** usan en la práctica
(¿la de 2004/05?, ¿la de 2015?, ¿una versión de su laboratorio?). No asumimos que sean idénticas.

### 1.2 Los 11 atributos

El protocolo dice textualmente que el formulario registra 11 atributos: Fragrance/Aroma, Flavor,
Aftertaste, Acidity, Body, Balance, Uniformity, Clean Cup, Sweetness, Defects y Overall. Son
**tres tipos de campo distintos**:

| Tipo | Atributos | Cómo se puntúa |
|---|---|---|
| **A. Escala de calidad por cupper** (7) | Fragrance/Aroma, Flavor, Aftertaste, Acidity, Body, Balance, Overall | Una nota por atributo, en una escala de calidad con pasos de **0,25**. Rótulos: 6,00 Good · 7,00 Very Good · 8,00 Excellent · 9,00 Outstanding (con 6,25/6,50/6,75, 7,25…, 9,25/9,50/9,75 entre medias). Máximo 10 por atributo. |
| **B. Conteo por taza** (3) | Uniformity, Clean Cup, Sweetness | El cupper juzga **cada taza** (5) y otorga **2 puntos por taza que muestra el atributo**, máx. 10 por atributo. Polaridad **positiva**: se suman puntos por tazas buenas. |
| **C. Resta** (1) | Defects | Se clasifica el defecto (**taint** = off-flavor notorio pero no abrumador, normalmente aromático, intensidad **2**; **fault** = off-flavor abrumador o que vuelve la muestra impalatable, normalmente en gusto, intensidad **4**), se describe ("sour", "rubbery", "ferment", "phenolic"…), se anota **en cuántas tazas** apareció y se resta. |

Campos auxiliares que **no puntúan** pero la hoja registra:
- *Fragrance/Aroma*: tres escalas verticales de intensidad de 5 puntos (**Dry, Break, Wet**) y una línea de "Qualities". La nota final debe reflejar los tres momentos.
- *Acidity*: escala vertical de **intensidad** (High–Low).
- *Body*: escala vertical de **nivel** (Heavy–Thin).
- *Roast level of sample*, *Sample #*, *Notes*, nombre y fecha.
- El protocolo permite **re-marcar** un atributo si cambia con la temperatura (marcar, tachar y flecha hacia la nota final). Evaluar "2 o 3 veces" mientras enfría.

### 1.3 Procedimiento (orden de captura)

1. **Fragrance/Aroma** — seco (≤15 min tras moler), costra 3–5 min, rotura de costra.
2. **Flavor, Aftertaste** a ~70 °C (160 °F); luego **Acidity, Body, Balance** (160→140 °F).
3. **Sweetness, Uniformity, Clean Cup**, por taza, cerca de temperatura ambiente (<100 °F).
4. **Overall** ("Cupper's Points") al llegar a ~70 °F (16 °C).
5. Suma y resta.

### 1.4 Cálculo

```
Total Score = Σ (7 escalas A) + Uniformity + Clean Cup + Sweetness     (máx. 7×10 + 3×10 = 100)
              donde cada atributo B = 2 × (nº de tazas con el atributo)   (0–10)
Defectos    = intensidad (2 taint | 4 fault) × nº de tazas afectadas
Final Score = Total Score − Defectos
```

- **No hay redondeo adicional**: todo son múltiplos de 0,25 y enteros → el Final cae siempre en pasos de 0,25.
- **Clasificación del Final** (tabla del protocolo 2005): 95–100 Exemplary (Super Premium Specialty) · 90–94 Outstanding · 85–89 Excellent (Premium Specialty) · 80–84 Very Good (Specialty) · 75–79 Good (Premium) · 70–74 Fair · 60–70 Usual Good Quality · 50–60 Average · 40–50 Exchange Grade · <40 Commercial / Below Grade / Off Grade.
- **Rango útil real:** el protocolo dice que la escala "teóricamente" va de 0 a 10, y que el tramo bajo (2 a 6) es para cafés comerciales catados para evaluar defectos. En especialidad las notas viven en 6–10, así que el piso práctico de un café limpio es ≈ 42 + conteos de taza.

### 1.5 Puntos que las fuentes NO resuelven ⚑ (para Bruno, §6)

- **¿Techo de 10,00 o de 9,75?** El texto habla de "16-point scale… entre 6 y 9" (6,00 → 9,75 son 16 valores) pero las marcas impresas llegan a 10. Si 10,00 es válido son 17 valores.
- **Varios defectos en una muestra:** el protocolo dice que el valor "se multiplica y resta", la hoja tiene un único bloque `# cups × Intensity`. Una fuente secundaria afirma que se toma solo el de mayor intensidad; no está verificado en la fuente primaria. ⚑
- **Una taza con taint y fault, o defecto que además quita Clean Cup/Uniformity:** ¿se descuenta doble (por conteo de taza y por defecto)? La hoja lo permite; la práctica de campo puede diferir.
- **Número de tazas:** el protocolo y la hoja asumen **5 tazas**. ¿Qué hacen con 3 o 6? (En CVA la app ya acepta `cupsPerSample` variable, con penalizaciones solo ≥5.)

---

## 2. Mapeo campo por campo contra el módulo afectivo CVA de la app

Referencias de código: `AFFECTIVE_ATTRIBUTES` (`lib/constants.ts:509`), `calcIndividualBreakdown` /
`calcIndividualScore` (`lib/scoring.ts:268`), `computeEvaluationDerived` (`lib/evaluation.ts`),
`CupToggleGrid`, `AffectiveBubbles`.

### 2.1 Atributos

| SCA 2004 | CVA afectivo (id en `AFFECTIVE_ATTRIBUTES`) | Relación |
|---|---|---|
| **Fragrance/Aroma** (1 nota, + intensidades dry/break/wet) | `fragancia_af` + `aroma_af` (2 notas 1–9) | **N:1.** CVA separa fragancia y aroma; 2004 las funde en una sola nota. No hay conversión honesta entre ambos. |
| **Flavor** | `sabor_af` | 1:1 en concepto; **escala distinta** (6–10 en 0,25 vs 1–9 entero). |
| **Aftertaste** | `sabor_residual_af` ("Sabor residual") | 1:1 en concepto. |
| **Acidity** (+ intensidad High–Low) | `acidez_af` | 1:1 en nota; la intensidad 2004 corresponde al módulo descriptivo de CVA, no al afectivo. |
| **Body** (+ nivel Heavy–Thin) | `sensacion_af` ("Sensación en boca") | Cercano, no idéntico: CVA habla de mouthfeel, 2004 de body. ⚑ ¿Bruno los considera equivalentes? |
| **Balance** | — | **No existe en CVA.** Campo nuevo. |
| **Sweetness** (2 pts × tazas) | `dulzor_af` (nota 1–9) | **Cambia de naturaleza:** en 2004 es conteo por taza, en CVA una nota de impresión. |
| **Uniformity** (2 pts × tazas uniformes) | `tazas_no_uniformes[]` → `u` (−2 por taza no uniforme) | **Polaridad invertida.** 2004 suma por taza buena; CVA resta por taza mala, solo con ≥5 tazas. |
| **Clean Cup** (2 pts × tazas limpias) | — (lo más cercano: `tazas_defectuosas[]` → `d`) | 2004 suma por taza limpia; CVA resta 4 por taza defectuosa. No es el mismo dato. |
| **Overall** | `impresion_global` | 1:1 en concepto ("Cupper's Points"). |
| **Defects** (taint 2 / fault 4 × tazas) | `tazas_defectuosas[]` (−4 por taza) + `defecto_tipo[]` (tipos) | CVA: penalización plana de 4 por taza defectuosa; 2004: **intensidad 2 o 4** × tazas, con clasificación taint/fault. Los tipos de defecto sensoriales ya existen (`SENSORY_DEFECTS`). |

### 2.2 Aritmética lado a lado

| | CVA (`lib/scoring.ts`) | SCA 2004 |
|---|---|---|
| Entradas de calidad | 8 notas enteras 1–9 | 7 notas 6–10 en 0,25 |
| Entradas por taza | 2 vectores booleanos negativos (no uniforme, defectuosa) | 3 vectores booleanos positivos (uniforme, limpia, dulce) + defecto con intensidad |
| Fórmula | `0,65625·Σh + 52,75 − 2u − 4d` | `Σ(7 escalas) + 2·(U+C+S) − intensidad·tazas_defecto` |
| Redondeo | a 0,25 al final | ninguno (ya es múltiplo de 0,25) |
| Punto de anclaje | todo en 5 → **79,00** (la "referencia" de la app se fija así) | no hay equivalente |
| Penalización por tazas | solo si `cupsPerSample ≥ 5` | siempre 5 tazas |
| Promedio de grupo | `calcCommunityScore`: promedio de rawScore menos penalizaciones **agrupadas** `totalNonUniform·(10/totalCups)` y `totalDefective·(30/totalCups)` | no definido por el SCA; lo natural es la media de los Final (ver §4) |
| Bandas | `scoreToCategory` / `scoreBand` (≥85 verde, 79 = "Bueno") | tabla del §1.4 |

**Conclusión del mapeo:** son dos instrumentos con *constructos* parecidos pero entradas, polaridades
y escalas distintas. **No hay función de conversión defendible** entre una nota de uno y la del otro, y no
debemos ofrecer una. (Ver §4.)

---

## 3. Qué se reutiliza y qué es genuinamente nuevo

### 3.1 Se reutiliza (sin tocarlo o con cambios menores)

- **Todo el ciclo de vida de sesión**: creación (wizard), invitaciones y join por QR/token, sala de espera, `closeSessionInternal`, cron de cierre, `assertSessionWritable`, claim de invitados, historial de cafés (`lib/coffeeHistory.ts`, con cuidado — §5).
- **Orquestación de `CupClient`**: navegación de muestras, pestañas, autoguardado con debounce de 800 ms, `flushSave` honesto ("pendiente de sincronizar"), realtime de sesión, guardia de salida, controles maestros.
- **Offline-first**: `lib/offline/store.ts` y `app/actions/offline.ts` (reproducción con las mismas reglas de autorización), `computeEvaluationDerived` como punto único de cálculo.
- **Componentes de UI**: `CupToggleGrid` (rejilla por taza; hay que parametrizar la polaridad y añadir 3 filas), `IntensitySlider` (las escalas dry/break/wet, intensidad de acidez, nivel de cuerpo son de 5 puntos), `Notes`, `PhaseStepper`, `ScoreDisplay`, `MasterControls`, `SampleTabs`, `ResponsiveDialog`.
- **Resultados**: `ScoreTable` y `DataTable` como carcasa, `ConfirmDialog`, `StatusPill`; el shell de 3 pestañas (`ResultsClient`).
- **Pipeline PDF**: `lib/pdf/` (fuentes registradas, `GroupSummaryDocument`, patrón `cvaFormData.ts` de ensamblado puro sin `@react-pdf`), envío de emails de cierre ledgerizado (`close_email_deliveries`).
- **Validación**: `lib/validate.ts` (`str`, `int`, `oneOf`, `cupFlags`) y el contrato `run()`/`ActionResult` para las acciones nuevas.

### 3.2 Genuinamente nuevo

1. **Control de nota con pasos de 0,25** en 6–10 (17 valores). `AffectiveBubbles` son 9 botones enteros; no sirven. Hace falta un selector táctil (regla con snap, o dos pasos: entero + cuartos) que funcione en móvil. Es la pieza de UX más delicada. ⚑ ¿Re-marcar con flecha de la hoja impresa, o solo "último valor"?
2. **Tres vectores de taza positivos** (Sweetness, Uniformity, Clean Cup) en vez de dos negativos. Distinto modelo de datos (§4).
3. **Bloque de defecto con clasificación taint/fault**, descripción, nº de tazas e intensidad derivada (2/4). Reutiliza `SENSORY_DEFECTS` para la descripción.
4. **Campo Balance** y la fusión **Fragrance/Aroma** con sus tres intensidades (dry/break/wet).
5. **Módulo de cálculo propio** `lib/sca2004.ts` (puro, con tests), análogo a `lib/scoring.ts` pero **nunca importando de él**.
6. **Hoja PDF clásica** (réplica de la hoja de 2004, no la CVA).
7. **Bandas de clasificación** propias (tabla del §1.4) y su copy.
8. **Reglas del formato dentro de la app**: qué hacer con referencia/anclaje (el "pin en 5" no aplica), con la fórmula comunitaria y con el descriptivo.

---

## 4. Por qué los puntajes 2004 y CVA nunca deben mezclarse

### 4.1 Razones de producto

- **Los números se parecen y no significan lo mismo.** Ambos van de 0 a 100 y comparten el corte de 80 para "especialidad"; precisamente por eso una mezcla pasaría desapercibida. Un 84,5 CVA y un 84,5 2004 salen de entradas, polaridades y calibraciones distintas (§2.2).
- **Sin conversión defendible** (§2): inventar una fórmula de equivalencia produciría una cifra con apariencia de rigor.
- **Un promedio comunitario con ambos sería ininterpretable** y arruinaría el valor principal de la app ("el puntaje necesita contexto", `PRODUCT.md`).

### 4.2 Dónde estaría el riesgo de contaminación en el código actual

Verificado leyendo el repositorio:

| Superficie | Riesgo |
|---|---|
| **Trigger `recompute_aggregate_score()`** (`prisma/sql/rls_and_triggers.sql`) | Se dispara en **cada** evaluación con `isDraft=false`, **sin filtrar por formato**. Elige columna con `CASE WHEN format = 'affective' THEN 'affectiveData' ELSE 'combinedData'` → un formato `sca2004` caería en la rama `combinedData`. Además hace `AVG("rawScore")` y, si es `NULL`, `COALESCE(...,0)` escribiría una **communityScore = 0** en `aggregate_scores`. Y aplicaría la fórmula comunitaria CVA (`10/totalCups`, `30/totalCups`) a tazas con otra polaridad. → **Requiere una guarda** (`IF v_format = 'sca2004' THEN RETURN NEW`), aplicada manualmente en Supabase como todo cambio de trigger. |
| `asSessionFormat()` (`lib/constants.ts`) | Un valor desconocido se **degrada silenciosamente a `"combined"`** (solo avisa en dev). Un cliente con deploy viejo, una caché del service worker o un borrador offline verían una sesión `sca2004` como combinada. Hay que ampliar el tipo **antes** de crear ninguna sesión y decidir qué hace el código viejo (⚑ ¿forzar actualización de SW?). |
| `moduleKeyForFormat()` (`lib/evaluation.ts`) | Mismo fallback: "cualquier otra cosa → combined". |
| `AggregateScore` | Tabla única por muestra, pensada solo para CVA. Escribir ahí un score 2004 mezcla escalas en el mismo registro. |
| `UserCoffeeHistory` (`syncCoffeeHistoryForSession`) | Guarda puntaje individual y comunitario por café tasteado para el historial del usuario y el perfil del café. Un 2004 aparecería junto a CVA, sin rótulo. |
| `lib/coffeeAggregate.ts` | Promedia `communityScore` (ponderado por participantes) entre sesiones de un mismo café → mezcla directa. |
| `lib/analytics/queries.ts` (Insights, informes IA, digest) | Promedia `individualScore` / `communityScore` entre sesiones; recibe `sessionFormat` pero no segmenta por sistema de puntaje. |
| `benchmark_lots` (CQI) | La base CQI Arabica importada (`scripts/data/cqi_arabica.csv`) trae columnas del **formulario clásico** (Aroma, Flavor, Aftertaste, Acidity, Body, Balance, Uniformity, Clean.Cup, Sweetness, Cupper.Points, Total.Cup.Points). Esto es una **oportunidad**: una sesión 2004 sería la comparación manzana-con-manzana contra ese benchmark, mientras que hoy un CVA se compara con él sin ser del mismo instrumento. ⚑ Verificar en `scripts/import-benchmark-lots.ts` qué hace hoy la UI al comparar. |
| `ScorePill`/`scoreBand`/`scoreToCategory` | Bandas calibradas a CVA (79 = ancla "Bueno"). Reutilizarlas rotularía mal un 2004. |
| Reglas de referencia (`lib/referenceRules.ts`) | El *pin* en 5 y el 79,00 de ancla son conceptos CVA. |

### 4.3 Forma más segura: dos opciones

**Principio de diseño (vale para ambas):** el sistema de puntaje es una propiedad **de la sesión**,
no del número. Toda lectura que agregue puntajes entre sesiones debe pasar por **un único predicado**
(`scoringSystem(format): "cva" | "sca2004"`), y las vistas nunca mezclan sistemas: o filtran, o muestran
dos columnas rotuladas.

#### Opción A — 4.º valor de `SESSION_FORMATS`: `"sca2004"` con su propia clave de módulo JSON (recomendada)

- `CuppingSession.format` es `String` (sin enum Prisma) → añadir el valor no exige migración de formato.
- Datos de la evaluación en una **clave de módulo propia**, p. ej. `sca2004Data` (columna `Json @default("{}")` nueva en `Evaluation` — una migración aditiva y nullable; **no** reutilizar `combinedData`).
- `individualScore` guarda el **Final Score 2004** para que tablas y listas funcionen, pero **`rawScore = NULL` y `affectiveSum = NULL`**, y `nonUniformCups`/`defectiveCups` se dejan vacíos (esos arrays los lee el trigger).
- **Guarda en el trigger** (bloque nuevo `PHASE n` en `rls_and_triggers.sql` + sección del runbook): `sca2004` no escribe `aggregate_scores`. El promedio de grupo 2004 se calcula **en lectura**, en TypeScript (`lib/sca2004.ts`, solo display, análogo a `computeGroupAggregate`).
- Predicado `scoringSystem()` aplicado en `coffeeAggregate`, `analytics/queries`, `syncCoffeeHistoryForSession`, `ScorePill`, emails, y en la ordenación de listas.
- **Pro:** reutiliza ~todo el ciclo de vida; un solo lugar para cerrar sesiones, emails, offline y claim. **Contra:** la contaminación se evita por *disciplina* (guarda + predicado); un lector nuevo que lo olvide mezcla. Mitigación: test que recorra los lectores de `individualScore`/`communityScore` y falle si no usan el predicado.

#### Opción B — módulo separado (tabla y rutas propias)

- Tabla `Sca2004Evaluation` con **columnas numéricas tipadas** (una por atributo, 3 vectores de taza, defecto), sin JSON; ningún lector de `Evaluation` la ve por construcción.
- Rutas propias de cata/resultados/impresión, o ramas explícitas dentro de las actuales.
- **Pro:** **imposible** contaminar `Evaluation`/trigger/`AggregateScore`/analytics por omisión; esquema fuerte. **Contra:** hay que duplicar o ramificar el envío (`submitAllEvaluations`), el auto-cierre solo, el reemplazo offline, el autoguardado, el historial de cafés, el cron de cierre y los emails; mucha superficie de `CupClient` (1.842 líneas) se bifurca.

### 4.4 Esfuerzo aproximado (ingeniería, 1 persona, sin contar revisión de Kim/Bruno)

| Bloque | Opción A | Opción B |
|---|---|---|
| Esquema + guarda de trigger + runbook + RLS | 1 d | 2 d (tabla + RLS nueva) |
| `lib/sca2004.ts` + tests (cálculo, redondeo, defectos) | 1 d | 1 d |
| Wizard: tarjeta de formato, validación, copy es/en | 0,5 d | 1 d |
| Formulario de cata (control 0,25, 3 vectores de taza, bloque defecto, Fragrance/Aroma con 3 intensidades) | 3 d | 3 d |
| Integración en `CupClient` / autoguardado / offline / envío / cierre | 1,5 d | 4–5 d |
| Resultados (tabla, ranking, promedio de grupo, drill-down, radar de 7 ejes o alternativa) | 2 d | 3 d |
| PDF clásico + impresión + email de cierre | 2–3 d | 2–3 d |
| Guardas anti-mezcla (café, historial, analytics, bandas) + test de cobertura | 1–1,5 d | 0,5 d |
| QA (móvil, offline, realtime, invitados) | 1,5 d | 2 d |
| **Total aproximado** | **~12–15 días** | **~19–24 días** |

Estimación gruesa (±40 %). **Recomendación: Opción A**, con la guarda del trigger y el test de cobertura
del predicado como condiciones de aceptación. La B solo se justificaría si el riesgo de contaminación se
considera inaceptable aun con test, o si se quisiera abrir la puerta a más formularios heredados (CQI/COE).

⚑ **Alternativa de menor alcance:** una v0 "hoja digital sin comunidad": solo cata individual y PDF, sin promedio de grupo ni historial de cafés. Reduce el riesgo de §4.2 a casi cero y cuesta ~7–9 días. Decidir si Bruno/Kim la consideran útil.

---

## 5. Impacto en resultados, PDF y emails

**Resultados** (`app/[locale]/app/sessions/[id]/results/`, `components/results/`)
- *Resumen*: ranking por Final 2004, promedio de grupo (media simple de los Final) y SD; rótulo visible "SCA 2004". Sin "Mejor muestra" ni Δ-vs-referencia hasta decidir qué es "referencia" en este formato. ⚑
- *Tabla*: columnas propias (7 notas + U/C/S + defectos + Final). `ScoreTable` hoy itera `AFFECTIVE_ATTRIBUTES`; necesita un modo de columnas por formato.
- *Gráfico*: `SampleRadarChart` usa los 8 ejes CVA. El radar 2004 tendría 7 ejes (los 3 conteos se pueden mostrar como 0–10 en la misma rueda). ⚑ ¿Radar o barras?
- *Descriptores*: los atributos descriptivos de CVA no existen en 2004 (solo "Qualities" libre + intensidades). La pestaña Descriptores debe ocultarse o limitarse a las notas libres, igual que hoy se oculta para el formato afectivo.
- *Desglose "¿Cómo se calculó?"* (`ScoreBreakdownPanel`): nuevo texto, sin la fórmula 0,65625.
- *Bandas de color*: tabla propia; **no** reutilizar `scoreBand`.

**PDF** (`lib/pdf/`)
- `CvaFormDocument` replica la hoja CVA; hace falta una `Sca2004FormDocument` que replique la hoja clásica (disposición del §1), con el mismo patrón puro `sca2004FormData.ts`. Mantener la regla de revelado del café/tostado (`null` hasta `sample.revealed`) y la regla de que `physical` solo va al dueño.
- Lección ya aprendida del pipeline: `lineHeight` en react-pdf rompe los números de página, y las fuentes necesitan trazado en el bundle (aprendido en S6 stream A).
- ⚑ **Derechos de reproducción de la hoja:** el formulario es obra del SCA. Confirmar con Kim/SCA si se puede reproducir la maquetación o si hay que hacer una hoja "inspirada en" con nuestros propios rótulos.

**Emails de cierre** (`lib/closeEmail.ts`, `close_email_deliveries`)
- Cambiar el adjunto según formato; el copy del correo no debe mencionar CVA para una sesión 2004. El ledger y el reintento no cambian.

**Otras superficies a revisar** (ver §4.2): perfil del café y su historial, Insights/IA (los prompts reciben solo agregados; hay que segmentar por sistema), `SessionsTable` (insignia de formato), `FormatBadge`.

---

## 6. Preguntas que Kim debería hacerle a Bruno

*Objetivo de la conversación: decidir si construir, no cómo.*

1. **Necesidad real.** Si la app ofreciera el formulario 2004, ¿lo usarían él y sus alumnos? ¿Lo usarían *en vez de* sus hojas de papel/Excel o solo para registrar? ¿Qué le falta a CVA para que lo acepte (si algo)?
2. **Versión exacta.** ¿Qué hoja usan: 2004/05, 2009, 2015, o una variante propia del laboratorio? ¿Pueden enviar la hoja en blanco que usan hoy? (§1.1)
3. **Escala.** ¿Techo de 10,00 o 9,75? ¿Se usan notas por debajo de 6 en café de especialidad? (§1.5)
4. **Defectos.** ¿Cómo suman varios defectos en la misma muestra? ¿Solo el mayor, o todos? ¿Un defecto que invalida una taza resta también de Clean Cup/Uniformity? ¿Se registra el tipo (descripción)?
5. **Número de tazas.** ¿Siempre cinco? ¿Qué hacen con tres o seis?
6. **Fragrance/Aroma.** ¿Una sola nota o registran dry/break/wet por separado? ¿Usan las escalas de intensidad (dry/break/wet, acidez, cuerpo) o las ignoran?
7. **Re-marcar.** ¿Re-marcan valores con la flecha durante el enfriado? ¿Hace falta guardar el historial de cambios o basta con el valor final?
8. **Calibración y grupo.** ¿Cómo calculan el puntaje de grupo hoy (media de Final, media por atributo, mediana, descartan outliers)? ¿Hacen calibración con muestra de referencia?
9. **Comparación con CVA.** ¿Aceptaría ver ambos puntajes *separados* en la misma sesión (dos hojas por muestra)? ¿O prefiere sesiones solo-2004? ¿Le preocupa que la app mezcle o contraste los dos?
10. **Uso del resultado.** ¿Para qué usan el puntaje: clasificación comercial, competencia, formación? ¿Necesitan exportar al formato Q Grader / CQI (Excel/CSV)?
11. **Q Grader / certificación.** ¿Los alumnos deben entregar la hoja en papel en el examen? ¿Aceptan una versión digital impresa?
12. **Idioma y rótulos.** ¿Prefieren los rótulos en inglés (Fragrance/Aroma, Taint/Fault) o la traducción? ¿Cómo dicen "taint" y "fault" en español/portugués?
13. **Disposición a probar.** ¿Estaría dispuesto a probar un prototipo en una cata real (fecha y número de personas)?

---

## 7. Riesgos y decisiones de producto abiertas

**Riesgos**
- **Contaminación de escalas** (§4): el riesgo principal. Un fallo es silencioso (números plausibles).
- **Degradación a `combined` en clientes viejos** (`asSessionFormat`, §4.2): una sesión 2004 vista por un cliente desactualizado se interpretaría como combinada. Requiere ampliar el tipo primero y revisar la estrategia de caché del SW.
- **Posicionamiento del producto.** CVA es el estándar vigente del SCA; ofrecer 2004 puede leerse como retroceso o diluir el mensaje. Se mitiga con rótulo explícito ("formulario clásico — legado").
- **Costo de mantenimiento**: dos instrumentos para cada nueva función de resultados, PDF, analytics.
- **Derechos de la hoja** (§5).
- **Base de usuarios incierta**: el pedido viene de una conversación con Kim (2026-10-15), no de una métrica de uso.

**Decisiones abiertas ⚑**
1. ⚑ ¿Construir? Depende de la respuesta de Bruno (§6, preguntas 1 y 13).
2. ⚑ Opción A vs B vs v0 sin comunidad (§4.3–4.4).
3. ⚑ ¿Un mismo evento puede tener hoja CVA *y* 2004 por muestra, o son sesiones excluyentes? (más caro: dos módulos por evaluación).
4. ⚑ Nombre del formato en la UI: "SCA 2004", "SCAA clásico", "Hoja Q Grader".
5. ⚑ Promedio de grupo 2004: ¿se muestra? ¿media simple de Final? ¿con SD? (Ver pregunta 8.)
6. ⚑ ¿Referencia/Δ en 2004? (el anclaje 79,00 no aplica; ¿se permite marcar referencia solo como contexto?)
7. ⚑ Benchmark CQI: ¿se usa sólo para sesiones 2004 (comparación válida) y se oculta en CVA? Requiere revisar la UI actual.
8. ⚑ Invitados (QR): ¿pueden usar la hoja 2004? Probablemente sí (mismo flujo), pero el claim/merge debe portar el nuevo JSON (`mergeGuestData`).
9. ⚑ Retención de históricos: un cupper con sesiones CVA y 2004 en su perfil: ¿dos listas o una con rótulo?
10. ⚑ Descargo legal sobre la hoja y marca "SCA".

---

## 8. Siguientes pasos (cuando se levante la compuerta)

1. Kim habla con Bruno (§6) y trae respuestas a las preguntas 1–5 y 9.
2. Ricardo decide ⚑1–⚑3. Si sí: convertir este memo en un prompt `docs/prompts/S7-sca2004.md` con el plan de la opción elegida.
3. Antes de escribir código: confirmar la hoja exacta (§1.1), actualizar `docs/flows.md` (los diagramas son normativos) y aprobar la guarda de trigger como cambio aparte.

*Fuentes principales:* texto del protocolo SCAA (abril 2005) y hoja en blanco, enlazados en §1.1; SCA/Daily Coffee News sobre la sustitución por CVA (§0).
