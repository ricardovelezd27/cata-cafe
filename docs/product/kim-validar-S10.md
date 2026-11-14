# Lista de validación para Kim (S10)

**Estado:** 2026-11-14. Todas las respuestas de Kim en `docs/product/kim-flows-2026-11/respuestas-kim-2026-11.md`
son SIMULADAS por un comité (Ricardo). Cada comportamiento construido sobre una de ellas lleva
`TODO(kim-validar:<código>)` en el código. Cuando Kim conteste, se revisa esta tabla fila por fila.

Cómo se generó: `git grep -n "TODO(kim-validar:"` sobre `app lib components hooks tests prisma`
(sin `docs/` ni `CLAUDE.md`). La columna "Dónde" lista los sitios principales (archivo:línea);
las líneas pueden moverse, el marcador es lo estable. Las reglas exactas están en `CLAUDE.md`.

Nota para Ricardo: las decisiones suyas mandan sobre la respuesta simulada en estos casos:
A1 (vale `docs/product/cata-descentralizada-puntaje.md`), B4 y E2 (aparcados), acidez y
dulzor (se quedan las listas, X4), C3 (los plazos de 24 h y 7 días son decisión suya) y C9.

## Tabla por código

### A · Cómo se cata

| Código | Dónde | Lo que está construido (sobre la respuesta simulada) | Pregunta para Kim |
|---|---|---|---|
| A1 | ``lib/scoring.ts:44``, ``lib/scoreLine.ts:15`` | Descuento plano del CVA a cualquier número de tazas (4 por taza defectuosa, 2 por no uniforme, máximo 6 por taza), diluido solo cuando el grupo junta más de cinco tazas. Las catas antiguas conservan su número; solo cambian si el dueño excluye o reincluye a alguien, acepta una evaluación tardía o un invitado reclama su cuenta y eso quita o reemplaza una evaluación enviada. | ¿Estás de acuerdo con que la regla del grupo sea plana hasta cinco tazas y se diluya solo con más (y no el 20 × defectuosas ÷ tazas de tu respuesta)? ¿Y con que las catas ya cerradas conserven su número antiguo? |
| A2 | ``lib/coffeeLifetimeScore.ts:14``, ``lib/indicativeCups.ts:7``, ``lib/reports/ranking.ts:69``, `app/actions/sessions.ts:280`, ``app/[locale]/app/sessions/new/NewSessionForm.tsx:210`` y `:367`, ``components/coffees/LifetimeScoreCard.tsx:8``, ``lib/coffeeLifetimeLines.ts:13`` | El asistente propone 2 tazas por muestra (1 en el exprés). El café tiene un puntaje de por vida (todas sus tazas de catas cerradas, reveladas y sin excluidos), se llama "Puntaje Café Sensible (base CVA)" y es "indicativo" con menos de 5 tazas juntas. | ¿Es correcto el nombre "Puntaje Café Sensible (base CVA)"? ¿Está bien que el puntaje del café cuente una voz por evaluación y todas las tazas para el descuento? |
| A3 | ``lib/cupDefects.ts:10``, ``lib/evaluation.ts:163``, ``lib/historyRules.ts:54``, ``components/ui/CupToggleGrid.tsx:34``, ``lib/coffeeLifetimeLines.ts:13`` | Tipo de defecto por taza (mohoso, fenólico, papa). Una taza marcada defectuosa siempre cuenta, con o sin tipo (sin tipo se lee "sin especificar"); para marcar una taza NUEVA hay que elegir tipo. "Impresión rápida" = exactamente 1 taza por muestra: su puntaje no entra en la base del café, sus tazas defectuosas sí cuentan. | Tu respuesta decía "sin tipo, no cuenta". Ricardo decidió que las 22 tazas antiguas cuenten como "sin especificar"; que TODA taza ya marcada cuente siempre se fijó al construir (para no perder descuentos ya guardados) y espera su confirmación. ¿Lo aceptas? ¿Una cata con 1 taza por muestra es una "impresión rápida"? |
| A4 | ``lib/blindLabels.ts:13``, ``lib/sessionEdit.ts:103`` | Las letras de las muestras se reparten al azar al crear la cata; una etiqueta escrita por el dueño se respeta. El dueño ve la clave letra a café en "Clave de muestras". | ¿Basta el azar con letras para clase? ¿Cuándo quieres los códigos de tres cifras para catas formales? |
| A5 | ``lib/cuppingTimer.ts:1``, ``components/cupping/CuppingTimer.tsx:13``, ``lib/affectivePartial.ts:2``, ``components/cupping/AttributeExtras.tsx:21``, ``lib/evaluation.ts:149`` | Temporizador opcional y discreto (avisos a los 4:00 costra y 8:00 primera pasada, luego dos pasadas sin hora). Segundo valor "al enfriarse" (`_inicial`); el valor final es el único que puntúa. | ¿Los tiempos 4:00 y 8:00 son los que quieres? ¿El segundo valor debe verse también en los resultados del grupo o solo al catador? |
| A9 | ``lib/samplePrep.ts:5`` | Por muestra, datos del dueño: fecha de tueste, nota de preparación y casilla "fuera de protocolo" con nota. Solo el dueño (o tras revelar) los ve. | ¿Faltan campos (agua, ratio, molienda como campos propios en vez de texto libre)? ¿Deben verse antes de revelar? |
| A10 | ``lib/marketNote.ts:2``, ``components/cupping/MarketNote.tsx:7``, ``lib/scorePillClass.ts:1``, ``lib/pdf/charts.tsx:435`` | El puntaje es solo un número, sin bandas ni nombres de calidad; la leyenda dice "79 es el punto neutro … 100 es el máximo". Nota de mercado opcional ("mi preferencia" o "un mercado que conozco" + texto). | ¿Las palabras de la leyenda coinciden con el formulario SCA en español? ¿La nota de mercado va en el mismo sitio que prefieres? |

### B · Referencia y alineación

| Código | Dónde | Lo que está construido | Pregunta para Kim |
|---|---|---|---|
| B1 | ``lib/referenceRules.ts:163`` | Dos modos de referencia: "ancla" (fijada en 5, 79.00, ejercicio de Café Sensible que no es CVA) y "libre" (todos la puntúan). Se elige al crear y solo antes de empezar. | Tu duda: ¿el ancla de 79 fue idea tuya para tus clases? ¿Con qué nombre quieres que se llame en la app? |
| B2 | ``lib/referenceRules.ts:307`` y `:397`, ``lib/referenceStashKey.ts:1``, `lib/evaluationPinWrite.ts:8`, `app/actions/sessions.ts:1221` y `:1261` | Cuando una referencia nueva fija las notas de un catador, sus valores anteriores se guardan aparte (`ref_previo`) y vuelven si la muestra deja de ser la referencia activa. | ¿Basta con restaurar automáticamente, o quieres que el catador decida? ¿Qué debe ver si ya re-puntuó la muestra? |
| B3 | ``lib/reports/personalComparison.ts:1`` y `:86`, ``components/results/SampleComparisons.tsx:4``, `app/[locale]/app/sessions/[id]/results/page.tsx:243` | En catas cerradas, "tú y el grupo": su total junto al del grupo, cada atributo e intensidad, y los descriptores compartidos o no. Solo con 3 o más catadores incluidos en cada fila. Sin la palabra "error". | ¿El mínimo de 3 por fila es correcto? ¿Quieres que la comparación en lo afectivo muestre algo más que el puntaje y la dispersión? |
| B6 | ``lib/reports/repeatedSample.ts:1``, ``components/results/SampleComparisons.tsx:4``, `app/[locale]/app/sessions/[id]/results/page.tsx:778` | Si una cata cerrada tiene dos muestras del mismo café, cada catador ve la diferencia entre sus dos evaluaciones (total e intensidades; hasta 2 puntos es "dentro de la tolerancia"). Sin nota de consistencia. | ¿Es 2 puntos la tolerancia para el total y para cada intensidad? ¿Cuándo quieres añadir una nota de consistencia? |

### C · La sesión mientras se cata

| Código | Dónde | Lo que está construido | Pregunta para Kim |
|---|---|---|---|
| C1 | ``lib/closeAnnounce.ts:1``, ``lib/closeRules.ts:15``, ``lib/lateContributions.ts:1``, ``app/actions/community.ts:971`` y `:1031`, ``components/cupping/CloseSessionDialog.tsx:3``, ``components/session/CloseAnnounce.tsx:3``, ``components/results/LateEvaluationsPanel.tsx:3``, ``components/offline/UnsyncedNotesPanel.tsx:63``, `app/actions/offline.ts:257` | El dueño anuncia el cierre con 2 o 5 minutos de aviso (solo aviso, el servidor no lo hace cumplir). Lo que un catador no alcanzó a enviar se guarda aparte y el dueño decide si lo acepta, viendo si se escribió antes o después de ver los resultados. | ¿Dos y cinco minutos son los avisos correctos? ¿El dueño debe poder aceptar una evaluación recibida después del cierre, sabiendo que pudo escribirse viendo los resultados? |
| C2 | ``app/actions/community.ts:1143``, ``components/results/PostCloseNote.tsx:3``, ``lib/lateContributions.ts:1`` | Después del cierre no se corrige ningún puntaje; el catador puede añadir una nota de texto (500 caracteres) a su evaluación enviada. La leen solo él y el dueño. | ¿Quién debe leer esa nota? ¿500 caracteres bastan? |
| C3 | ``lib/closeRules.ts:225`` y siguientes, ``lib/idleClose.ts:2`` | Cata en vivo sin actividad: recordatorio al dueño a las 24 h y cierre automático a los 7 días. Una cata que empezó antes del 2026-11-18 nunca recibe correo por esta regla; con 30 días o más sin actividad se cierra en silencio. | ¿Son 24 h y 7 días los plazos? ¿Qué debe pasar con catas muy viejas (hoy se cierran en silencio)? |
| C4 | ``lib/affectivePartial.ts:2``, ``components/cupping/AttributeExtras.tsx:21``, ``lib/evaluation.ts:149``, ``prisma/sql/rls_and_triggers.sql:2909`` | "No evaluado" por sección: quien llegó tarde marca las secciones que no pudo juzgar; su evaluación es "parcial", no tiene total y no entra en el promedio de totales, pero sus atributos puntuados alimentan el radar. | ¿Debe poder marcarse cualquier sección, o solo fragancia y aroma? ¿Cómo prefieres que se vea el radar con secciones sin evaluar? |
| C5 | ``lib/sessionState.ts:116``, ``lib/cupGroupProgress.ts:2``, ``lib/historyRules.ts:38``, ``prisma/sql/rls_and_triggers.sql:2779``, ``app/[locale]/app/groups/[id]/page.tsx:311`` | Los resultados del grupo se ven solo al cerrar (también en el servidor y en la base de datos). "Todos enviaron" ya no los abre. | ¿Confirmas que el grupo nunca se ve antes del cierre, ni siquiera cuando todos enviaron? |
| C8 | ``lib/groupNotify.ts:62`` | En una cata en vivo, el dueño elige si el grupo recibe el aviso al crearla o al iniciar (por defecto al iniciar). En catas a ritmo propio, siempre al crear. | ¿Cuál debe ser el valor por defecto en vivo? |
| C9 | ``lib/sessionState.ts:149``, `app/actions/sessions.ts:1377`, `app/[locale]/app/sessions/[id]/edit/EditSessionForm.tsx:166` | Una vez pasada la fecha de cierre no se puede cambiar nada de la cata (ni la fecha); nunca se reabre. | ¿Seguro que nunca se reabre ni se cambia la fecha? |

### D · Resultados e informes

| Código | Dónde | Lo que está construido | Pregunta para Kim |
|---|---|---|---|
| D1 | ``lib/originEdit.ts:15`` | Los datos de origen siempre se pueden editar, y los informes dicen "Datos de origen editados el {fecha}" si se cambiaron después del cierre. | ¿La nota "editado" debe decir además qué campo cambió? |
| D2 | ``lib/exclusionReasons.ts:4``, ``lib/exclusionNotice.ts:7``, ``components/results/ExclusionDialog.tsx:11``, ``app/actions/community.ts:902`` | Lista fija de motivos para excluir (muestra equivocada, protocolo, incompleta, "no estaba en condiciones de catar", prueba o duplicado, otro con texto de hasta 120 caracteres). Nunca "puntuó distinto". El excluido ve un aviso privado en su propia página. | La palabra "no estaba en condiciones de catar" sustituye a "problema de salud" (por privacidad). ¿Te sirve? ¿El aviso privado debe llegar también por correo? |
| D3 | ``lib/reports/ranking.ts:63`` y `:91`, ``lib/reports/fichaTecnica.ts:170`` | "Indicativo" con 3 a 5 catadores y firme desde 6; sin "mejor café" ni dispersión con menos de 3; "sin diferencia clara" cuando la diferencia es menor que el mayor entre 1 punto y media desviación. | ¿Es correcto que 6 sea el punto firme? ¿Y la regla de empates? |
| D5 | ``lib/reports/csvCodes.ts:9``, ``lib/reports/resultsCsv.ts:6``, ``app/api/sessions/[id]/results-csv/route.ts:6`` | El CSV de resultados lleva una columna con código `C-XXXX` por catador (no revela el orden de llegada). La variante sin nombres no trae nombre, id, correo ni motivo de exclusión. | ¿Los códigos deben cambiar entre sesiones (hoy cambian)? |
| D7 | ``app/[locale]/app/groups/[id]/page.tsx:216``, ``lib/groupRoster.ts:12`` | Los miembros de un grupo ven los nombres de los demás, nunca un correo. Solo el dueño ve correos (enteros los escritos a mano, enmascarados los de cuentas). | ¿Quieres que el profesor pueda elegir otro nivel de visibilidad del roster? |

### E · Invitados y aparatos

| Código | Dónde | Lo que está construido | Pregunta para Kim |
|---|---|---|---|
| E1 | ``lib/joinRules.ts:85``, ``app/[locale]/join/[token]/page.tsx:72``, ``components/join/GuestIdentityChoice.tsx:65``, ``components/layout/SignOutButton.tsx:33`` | Al abrir el QR en un aparato donde ya hay un invitado, la app pregunta "¿Eres {nombre}?"; "No soy {nombre}" cierra esa identidad local sin borrar sus borradores. | ¿Qué debe decir la pantalla si en la mesa hay varias personas en la misma tableta? |

### F · Movimiento Sensorial

| Código | Dónde | Lo que está construido | Pregunta para Kim |
|---|---|---|---|
| F1 | ``lib/warmup/overlayGate.ts:70``, `app/[locale]/app/sessions/[id]/cup/CupClient.tsx:785` | Antes del agua el calentamiento se ofrece solo; después, un botón discreto "Movimiento Sensorial" en la barra de la cata. | ¿Debe poder abrirse una vez hay agua en la taza? |
| F2 | ``lib/warmup/reflections.ts:9`` | Las reflexiones se guardan en la cuenta, privadas, solo para esa persona (ni profesor ni grupo). Máximo 200 por ejercicio. | ¿Quieres un modo "no guardar nunca" y un límite distinto? |
| F3 | ``app/[locale]/app/warmup/page.tsx:104`` | **NECESITA TU SÍ.** La página de la biblioteca muestra con tu nombre (clave `warmup.library.kimLine`, `messages/es.json:2229`) la frase: «En mis clases veo que los catadores llegan más presentes a la mesa.» Se publicó por decisión de Ricardo ("ship now", 2026-11-13) sin tu confirmación. No se promete que "despierta los sentidos". | ¿Confirmas esa línea tal cual (te la atribuimos) o la cambiamos? Si no, se quita. |
| F4 | ``lib/warmup/exercises.ts:155`` `:163` `:166`, ``lib/warmup/timeline.ts:153`` `:175` `:359` `:360` | Versión corta de 1 a 2 minutos (postura 5 s, una respiración, los primeros pasos, vuelta al centro, cierre de 15 s). Sin cue "abre los ojos" salvo que un paso cierre los ojos. | Una corrida corta con los ojos abiertos no tiene sonido de final (el último es el cuenco al empezar el cierre). ¿Añadimos un solo tic? |
| F5 | ``components/warmup/WarmupPlayer.tsx:309``, ``lib/warmup/exercises.ts:231`` y `:262` | Dos opciones en la introducción: "Sentado" (solo el ejercicio de pie) y "Poco espacio" (movimientos de amplitud pequeña); se recuerdan en el aparato y no cambian la duración. | ¿Faltan sustituciones para otros ejercicios? |

### V · La voz que guía el Movimiento Sensorial (2026-11-14)

Desde el 2026-11-14 una voz grabada dice cada paso mientras la persona tiene los ojos cerrados.
Para eso se reescribieron TODOS los textos de los cinco ejercicios (pasos y "qué notar"), en
español y en inglés, pensados para oírse y no para leerse. Tus textos originales siguen en el
historial (commit 2c7ae35). Nada de esto es definitivo hasta que lo revises.

| Código | Dónde | Qué se hizo | Qué necesitamos de ti |
|---|---|---|---|
| V1 | `lib/warmup/exercises.ts` (los 38 pasos y los 13 "qué notar") | Frases más cortas. La duración ya no se repite en cada frase ("en 15 segundos"): se dice una vez por ejercicio ("mientras dure el sonido, unos 15 segundos") y después la lleva el sonido. "Detente" en vez de "párate"; "hacia adelante" en vez de "hacia delante". El último movimiento de cada ejercicio lo dice ("último"); los tres ejercicios largos avisan "Vas por la mitad". Se mantienen tus datos: trayectos de 15 s, pausas de 3 s, las direcciones, los puntos de arranque y el orden rápido / lento / ojos cerrados. | Leer (o mejor, oír) los cinco ejercicios y corregir lo que no dirías así. |
| V1 | `lib/warmup/exercises.ts`, "qué notar" | Ahora también se DICEN en voz baja durante el movimiento (antes solo se veían en pantalla, y con los ojos cerrados nadie los leía). Se acortaron y casi todos empiezan por "Nota…". | ¿Te parece bien que se digan? ¿El momento en que suena cada uno es el correcto? |
| V1 | `messages/es.json`, `messages/en.json` (`warmup.arrive`, `warmup.breath`, `warmup.closing`) | La llegada y el cierre se acortaron para que quepan en su tiempo: "Pies en el suelo, manos sobre las piernas, hombros sueltos."; "No hay nada que hacer bien. Solo notar."; "Ahora quédate en quietud, en posición neutral. Nota lo que deja el movimiento." | Confirmar o corregir. |
| V1 | `lib/warmup/script.ts` | Después de cada campana la voz dice la dirección con una frase corta ("A la derecha.", "Al centro.", "Para."). "Rápido", "Quieto" y "A continuación" ya no se dicen: solo se ven. | ¿Falta o sobra alguna indicación hablada? |
| V1 | la voz | La voz en español es "Dora" con pronunciación latinoamericana (elección de Ricardo, de oído); el texto es español neutro. Es una voz generada por computadora y la app lo dice. | ¿La pronunciación te parece adecuada para tus grupos? |

### X · Otros

| Código | Dónde | Lo que está construido | Pregunta para Kim |
|---|---|---|---|
| X3 | ``lib/revealFreeze.ts:2``, ``lib/sessionState.ts:69``, `app/actions/sessions.ts:815`, ``lib/closeRules.ts:559`` | Una muestra revelada en una cata abierta ya no admite nuevas puntuaciones (descriptivo, afectivo y combinado). El dueño confirma antes de revelar. | ¿Seguro que no se debe poder corregir tras revelar? |
| X4 | `CLAUDE.md` (sección "Creating a session"; sin marcador en el código) | Los selectores de descriptores de acidez y dulzor se quedan en el formulario a propósito, aunque el CVA 2024 ya no los tiene. Decisión de Ricardo sobre tu respuesta ("las listas fijas se quedan"). | ¿Los quitamos? |
| X6 | ``lib/sampleCount.ts:4`` | Aviso (nunca tope) sobre más de 6 muestras (más de 4 en combinado). | ¿Los umbrales son correctos? |

## Recuento de marcadores por código

Contados el 2026-11-14 con `git grep -o "kim-validar:[A-Z][0-9]*"` sobre `app lib components hooks tests prisma`
(una cifra por aparición, tests y SQL incluidos). Total 137.

A1 2, A2 12, A3 7, A4 2, A5 8, A9 1, A10 4, B1 1, B2 7, B3 4, B6 3, C1 11, C2 4, C3 13, C4 8, C5 7, C8 1, C9 3, D1 1, D2 4, D3 3, D5 3, D7 2, E1 4, F1 3, F2 1, F3 1, F4 9, F5 3, X3 4, X6 1.

## Preguntas abiertas que dejaron los cuerpos de los PR de S10

- #127 (A3): para una taza defectuosa la línea de puntaje dice "- 4 (1 taza fenólica) - 2 (1 taza no uniforme)" y parece que son dos tazas. ¿Se deja o se reformula?
- #122 (F4): ver la fila F4 (un tic final en la versión corta con ojos abiertos).
- #132 (A2), tres dudas: (a) el radar y los promedios por atributo siguen incluyendo las anclas en 5 y las impresiones rápidas aunque el puntaje no; (b) con una sola evaluación la página dice "encontrada por 1 persona" y el tipo de defecto: ¿debe exigirse un mínimo de personas?; (c) las referencias anteriores (desbloqueadas) quedan fuera del puntaje del café.
- #137 (A5, C4): el radar dibuja una sección sin evaluar de una evaluación parcial en el centro (0), no en 5. ¿Es lo que quieres?
- #138 (F3): la línea en primera persona (ver F3) necesita tu confirmación.
- #123 (C3, C5, C9): los valores de 24 h, 7 días y "nunca reabrir" son decisión de Ricardo; confirma que te parecen bien.
- #120 (A4, A9): el orden de las letras al azar no se puede reproducir; una muestra añadida después se reconoce como la más nueva. ¿Aceptable?
- Dudas de tu propia hoja (`respuestas-kim-2026-11.md`, "Dudas que me quedaron"): B1 (ver arriba), A1 (cuántas catas antiguas había: son 47 muestras con marca y 60 evaluaciones; ninguna se recalcula), el nombre del puntaje (ver A2), A10 (comprobar las palabras con el formulario oficial en español) y E2 (aparcado).

## Cosas aparcadas por Ricardo (no se construyeron)

B4 (guía del profesor y tipo de sesión), E2 (correo opcional al entrar), consentimiento de los
miembros de un grupo, declaración de accesibilidad, E5 (crear cata sin conexión).
