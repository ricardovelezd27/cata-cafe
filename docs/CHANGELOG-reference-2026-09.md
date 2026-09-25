# Muestra de referencia — septiembre 2026 (lenguaje llano)

Este es el resumen no técnico de la función "muestra de referencia" construida entre el
8 y el 22 de septiembre de 2026, sobre la rama `claude/cafe-sensible-improvements-51283e`
(commits `8b36b9e`, `19ef794`, `02d3e34`). Dice qué problema resuelve, qué cambia para
cada tipo de usuario, qué sigue igual, y cómo comprobarlo a mano antes de fusionarla a
`main`. El detalle técnico vive en `docs/flows.md` ("Reference sample (2026-09)") y en
`PRODUCT.md` ("El puntaje necesita contexto").

## Qué problema resuelve

Un puntaje CVA solo, sin nada al lado, no dice mucho: 84 puntos es "muy bueno" en
abstracto, pero ¿muy bueno respecto a qué? El mismo café puede ser excelente para un
objetivo (café de filtro, formación) y poco adecuado para otro (espresso, el target de
un comprador). Hasta ahora la app ya daba dos comparaciones — la media del grupo y la
dispersión (± DE) — pero faltaba la más intuitiva en sala: "¿cómo se compara esta
muestra con la que elegimos como punto de partida?". La muestra de referencia resuelve
eso: el maestro marca una muestra como "Referencia" y cada otra muestra muestra un Δ
(diferencia) firmado contra ella, sin tocar el puntaje ni el ranking. La primera prueba
en vivo es la **cata de calibración de fin de mes** de Kim — ver
`docs/product/experimento-referencia-2026-09.md` para el guion de sala y qué observar.

## Qué cambia, por usuario

### Organizador (maestro)

- En el asistente de nueva sesión, sección "Muestras": un radio por muestra para marcar
  cuál es la referencia, más un botón "Sin referencia" para quitarla. En sesiones
  grupales, el paso 2 del asistente muestra "Referencia: <etiqueta>".
- En la página de edición de la sesión: un selector "Muestra de referencia" que guarda
  al instante (sin botón "Guardar" aparte).
- Dentro de `/cup`: en sesiones grupales, el selector vive en el "Panel de maestro"; en
  sesiones solo, dentro del diálogo ✎ "Editar muestra".
- Cambiar la referencia a mitad de sesión se ve en vivo para los participantes, sin que
  necesiten recargar la página.

### Participante

- Un pill pequeño "Referencia" en la pestaña de esa muestra.
- En el encabezado de esa muestra: "Muestra C · Referencia".
- En las demás muestras: la pista "Compara con la referencia (C)".
- En la sala de espera: "Muestra de referencia: C".

### Invitados por QR

- Nada cambia en el flujo de unirse — siguen entrando solo con un nombre. Ven los mismos
  pills y pistas que cualquier participante.

### Todos (resultados, PDF)

- Un badge "Referencia" dondequiera que aparece la etiqueta de esa muestra: el ranking
  del Resumen, la Tabla, las tarjetas del Gráfico, el drill-down por muestra, y la matriz
  del maestro.
- Un chip Δ firmado junto al puntaje de cada otra muestra — la diferencia contra la
  referencia, calculada siempre con el mismo tipo de puntaje que tiene al lado: en el
  ranking, el que se muestra (comunitario cuando está visible, si no el personal); en la
  Tabla, un Δ bajo tu puntaje (personal vs. personal) y otro junto a la línea comunitaria
  (comunitario vs. comunitario); en las tarjetas del Gráfico, personal vs. personal. Nunca
  se mezcla un puntaje personal con uno comunitario. La fila de la referencia no muestra Δ.
- Un ícono de información "Muestra de referencia" que explica que referencia ≠ media del
  grupo ≠ desviación estándar (± DE) — son tres lecturas distintas del mismo puntaje.
- Una línea de leyenda debajo de la tabla recordando qué significa el Δ.
- El PDF y las hojas impresas muestran "<etiqueta> · Referencia" junto al nombre de la
  muestra.

## Qué NO cambia

- El puntaje CVA y la fórmula: la referencia no entra en el cálculo, solo se muestra al
  lado. La referencia también se puntúa y se rankea como cualquier otra muestra.
- El ranking, el puntaje comunitario, la desviación estándar (± DE) y el trigger de
  PostgreSQL — todo eso sigue siendo la misma fuente de verdad de siempre.
- Sesiones existentes sin referencia marcada: se ven exactamente igual que antes: sin
  badge, sin Δ, sin línea de leyenda adicional.
- No hay paso manual de Supabase (RLS, trigger, Realtime): la columna es aditiva y
  nullable, y el cambio de referencia viaja por el stream `cupping_sessions` que ya
  existía.

## Estado

Construido el 2026-09-22. `npx tsc --noEmit` y `npm run lint` pasan limpio sobre la
rama. Pendiente:

- [x] Migración `20260922120000_reference_sample` aplicada en producción el 2026-09-24
  (runbook §7).
- [x] Prueba con dos usuarios hecha el 2026-09-24 (todos los pasos de "Cómo comprobarlo").
  Salvedad: la actualización en vivo en la pantalla del participante no pudo confirmarse
  desde el navegador de pruebas (la pestaña en segundo plano perdió la conexión); en la
  pantalla del maestro sí se observó. Conviene comprobarlo en la cata real: si el
  participante no ve el cambio, basta con recargar la página.
- [ ] Pendiente: fusionar `claude/cafe-sensible-improvements-51283e` a `main` y desplegar.
- [ ] Segunda iteración construida 2026-09-25 en la rama claude/reference-first-anchor;
  pendiente: prueba en navegador, PR y despliegue.

## Arreglo adicional encontrado en la prueba

Al borrar la sesión de prueba apareció un error previo (no causado por la referencia): borrar
una sesión cerrada con evaluaciones enviadas fallaba por una restricción de la base de datos
en el historial de cafés. Está corregido en esta misma rama (`lib/coffeeHistory.ts`): el
historial de cada catador se desvincula explícitamente antes de borrar la sesión, tal como
ya prometía la función "borrar conserva el historial".

## Cómo comprobarlo

Usa dos navegadores (uno normal + uno privado): **A** = maestro, **B** = participante.

1. En A: crea una sesión **grupal** con al menos 3 muestras (A, B, C) y marca **B** como
   referencia en el asistente (paso "Muestras"). En el paso 2 del asistente debe leerse
   "Referencia: B".
2. En B: abre el enlace de invitación y entra a la sala de espera. Debe verse
   "Muestra de referencia: B".
3. En A: entra a `/cup`, abre el "Panel de maestro" y cambia la referencia a **C**.
4. En B (sin recargar): la pestaña de C debe mostrar el pill "Referencia" y las demás
   muestras deben mostrar "Compara con la referencia (C)" — el cambio debe llegar solo,
   sin recargar la página.
5. Ambos (A y B) puntúan las tres muestras y envían. A cierra la sesión.
6. En resultados (Resumen y Tabla/Gráfico): la muestra C debe llevar el badge
   "Referencia"; A y B deben mostrar un Δ firmado contra C (en el ranking, con el puntaje
   comunitario; en la Tabla, un Δ personal bajo el puntaje y un Δ comunitario en la línea
   "Com."; en el Gráfico, el personal).
   El ícono de información debe explicar referencia vs. media vs. ± DE. Debe verse la
   línea de leyenda bajo la tabla.
7. Exporta el PDF (Imprimir / PDF): la muestra C debe imprimirse como "C · Referencia".

Comprobaciones adicionales:

- **Página de edición**: cambia la referencia desde `/sessions/[id]/edit` con la sesión
  ya cerrada — el selector no debe permitir el cambio (referencia congelada al cerrar).
- **Duplicar sesión**: duplica una sesión con referencia marcada — la copia debe
  conservar la misma muestra como referencia (remapeada por posición).
- **Quitar la muestra de referencia**: si el maestro borra la muestra marcada como
  referencia (antes de cerrar), `referenceSampleId` debe quedar en `null` — sin badge, sin
  Δ, sin error.

## Segunda iteración (2026-09-25): la referencia se cata primero y queda fijada en 5

Después del primer ciclo (arriba), Kim propuso un ajuste a partir de cómo se usa la
referencia en la práctica: si su función es dar un punto de partida común, tiene que
catarse primero, y si no se le puntúa realmente (todos la anclan en el mismo valor), no
tiene sentido pedirle al catador que la puntúe — solo que la describa. Esta segunda
iteración construye eso.

### Qué ve el catador

- **Orden**: la muestra de referencia ya no aparece donde le tocaba por posición — es
  siempre la primera pestaña, para el maestro y para cada participante. Las demás muestras
  mantienen su orden entre sí. Si el maestro cambia la referencia a mitad de sesión, el
  orden se reacomoda al instante y cada catador se queda mirando la muestra que tenía
  abierta (no salta a otra por error).
- **Burbujas bloqueadas**: al entrar a la referencia, las ocho burbujas de calidad
  aparecen fijas en 5 ("ni alto ni bajo") y no se pueden tocar; las casillas de tazas no
  uniformes / defectuosas tampoco. Un aviso arriba del formulario explica por qué. Lo único
  que se puede — y se debe — llenar es la parte descriptiva: intensidad, descriptores de
  sabor, notas. En sesiones **afectivas** (sin parte descriptiva) el aviso dice
  directamente que no hay nada que puntuar en esa muestra, solo catarla y anotar lo que se
  perciba.
- **Las demás muestras**: se puntúan exactamente como siempre — burbujas libres, tazas
  editables.
- Sesiones **solo descriptivas** no cambian en nada: nunca tuvieron burbujas de calidad,
  así que no hay nada que fijar.

### Qué ve el maestro (resultados)

- La referencia ya no aparece dentro del ranking — sale como una tarjeta ancla
  ("Referencia (ancla)") arriba de la lista, con su puntaje (79.00 siempre que alguien la
  haya guardado) y sin puesto asignado.
- Queda fuera del promedio de sesión y de "Mejor muestra" — no tiene sentido promediarla ni
  competir con ella si su puntaje está fijado de antemano.
- El Δ (diferencia) de cada muestra contra la referencia se calcula igual que antes y se
  sigue mostrando junto a cada fila del ranking.
- La tabla, el gráfico, el PDF y las hojas impresas listan la referencia primero, igual que
  en `/cup`.

### Qué NO cambia

- Sesiones **solo descriptivas**: sin cambios — nunca hubo calidad que fijar.
- La fórmula de puntaje y el trigger de PostgreSQL: intocados. El 79.00 de la referencia
  sale de la misma fórmula que cualquier otro puntaje, solo que con todos los insumos
  fijados en 5.
- Evaluaciones **ya guardadas** antes de este cambio: no se reescriben. El bloqueo solo
  aplica a partir de ahora, hacia adelante — si alguien ya había puntuado la referencia con
  otros valores, esa evaluación queda como estaba.

### Cómo comprobarlo (esta iteración)

1. Crea una sesión grupal **afectiva** con al menos dos muestras y marca **B** como
   referencia.
2. Entra a `/cup`: debe abrir directamente en **B**, con las burbujas fijas en 5 y el
   aviso explicando que no hay nada que puntuar — solo catar y anotar.
3. Pasa a la siguiente muestra: las burbujas deben estar libres y editables, como siempre.
4. Cierra la sesión.
5. En resultados: debe verse la tarjeta "Referencia (ancla)" con 79.00, arriba del
   ranking, y **B** no debe aparecer en la lista de puestos.
6. En la tabla y en el PDF: **B** debe listarse primero.

## Siguiente ciclo

Las decisiones sobre qué construir después de esta primera prueba en vivo (radar de tres
polígonos yo/referencia/grupo, Δ por atributo, objetivos estructurados, etc.) se
recogen en `docs/product/experimento-referencia-2026-09.md` §7 durante y después de la
cata de calibración. El diseño de fondo — qué metodologías de cata necesitan referencia y
cómo debería leerse el puntaje en cada una — vive en
`docs/product/objetivos-y-metodologias.md`. No se construye nada de esa lista sin
evidencia de esta primera prueba.
