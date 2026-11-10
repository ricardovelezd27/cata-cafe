# Preguntas para Kim — flujos de Café Sensible (noviembre 2026)

---

## Instrucciones para el Claude de Kim

Eres el asistente de Kim Ossenblok, profesor de cata de café y cofundador de Café Sensible. Ricardo
(su socio técnico) acaba de revisar a fondo cómo funciona la app y ha encontrado **45 decisiones que
solo un catador puede tomar**. Tu trabajo es ayudar a Kim a responderlas con calma, en una conversación
normal, y al final producir un archivo con sus respuestas.

Reglas:

1. **Una pregunta a la vez.** Lee la pregunta tal como está escrita aquí, con su contexto y sus
   opciones. No las agrupes ni las resumas. Si Kim quiere saltarse una, anótala como «(sin responder)»
   y sigue.
2. **Habla de café, no de tecnología.** Nunca uses palabras como base de datos, servidor, código,
   sincronizar, endpoint, cookie. Si Kim pregunta cómo se haría técnicamente, dile que de eso se
   encarga Ricardo y vuelve a la pregunta.
3. **Las respuestas son texto plano.** Una letra (a, b, c), un número o una frase. Si Kim contesta
   algo que no encaja con las opciones, acéptalo igual y escríbelo tal cual: la respuesta libre vale
   más que forzar una letra.
4. **Repregunta solo si de verdad no se entiende.** Una vez. No insistas ni intentes convencerlo.
   Cada pregunta trae una línea «Si no decides» con lo que haremos por defecto: si Kim dice «lo que
   os parezca», apunta esa opción por defecto.
5. **Sigue el orden A → F.** Las preguntas con ⚑ bloquean trabajo de desarrollo: si Kim tiene poco
   tiempo, hazle primero todas las ⚑ y deja las ◇ para otro día.
6. **Al terminar**, genera un archivo Markdown llamado `respuestas-kim-2026-11.md` con el formato
   exacto que aparece al final de este documento (sección «Formato del archivo de respuestas»). Incluye
   las respuestas de Kim, sus comentarios literales cuando los haya, y las dos secciones finales
   («Dudas que me quedaron» y «Cosas que no me preguntaron»). Dile a Kim que lo exporte y se lo envíe a
   Ricardo.

Empieza presentándote en una frase, dile a Kim cuántas preguntas hay (45; 18 con ⚑) y que puede parar
cuando quiera y seguir otro día, y pasa a la pregunta A1.

---

## Para Kim: de qué va esto

Hemos pasado la app entera por una revisión independiente, flujo por flujo (entrar, crear una cata,
catar en grupo, resultados, informes, cafés, grupos, sin conexión, Movimiento Sensorial…). La mayoría
de lo que salió lo arregla Ricardo sin molestarte. Pero hay un puñado de decisiones donde la respuesta
correcta depende de **cómo se cata de verdad**, no de cómo se programa. Esas son las de aquí.

Cada pregunta tiene: lo que vemos hoy en la app, la pregunta, las opciones que se nos ocurren y lo que
haremos si no dices nada. No hay respuestas malas; «como está ahora» también es una respuesta.

Leyenda: **⚑** = necesitamos tu respuesta antes de tocar esa parte · **◇** = mejora, puede esperar.

---

## A · Cómo se cata: tazas, puntuación y formulario

### A1 ⚑ · Tazas por muestra y penalizaciones con menos de cinco tazas
**Lo que vemos hoy.** El protocolo CVA habla de cinco tazas por muestra. En la app el asistente propone
2 tazas por defecto y el exprés usa 1. Con menos de 5 tazas, la pantalla no descuenta puntos por tazas
no uniformes o defectuosas, pero el puntaje del grupo que se guarda sí los descuenta: el mismo café
puede salir con dos números distintos.
**Pregunta.** Con menos de cinco tazas, ¿qué hacemos con los descuentos por uniformidad y defectos?
**Opciones.** (a) nunca descontar por debajo de 5 tazas, y ni siquiera mostrar las casillas ·
(b) descontar igual los 2 y 4 puntos por taza · (c) descontar en proporción a las tazas catadas.
**Si no decides.** (a).
_(ref: F-grupal-1, F-04-4, F-crear-sesion-5; brief cupping-protocol Q1)_

### A2 ⚑ · El número de tazas por defecto
**Lo que vemos hoy.** Afectivo y combinado arrancan con 2 tazas; nadie avisa de que con 2 no hay
descuentos.
**Pregunta.** ¿Cuántas tazas por muestra usáis casi siempre en una cata seria, y qué número debe
proponer la app?
**Opciones.** (a) 5 siempre por defecto · (b) 5 en afectivo/combinado y libre en descriptivo ·
(c) dejar 2 y solo avisar.
**Si no decides.** (b).
_(ref: K-04-2, K-crear-sesion-1)_

### A3 ◇ · ¿Una cata de una o dos tazas sigue siendo «CVA»?
**Lo que vemos hoy.** Un puntaje exprés de una taza se guarda en el historial del café igual que un
puntaje de cinco tazas, sin marca.
**Pregunta.** ¿Cómo tratamos esos puntajes rápidos?
**Opciones.** (a) mismo puntaje, sin marca · (b) mismo puntaje con la etiqueta «impresión rápida» ·
(c) no entran en el historial de puntajes del café.
**Si no decides.** (b).
_(ref: K-express-2; brief Q2)_

### A4 ◇ · Códigos de las tazas en una cata a ciegas
**Lo que vemos hoy.** Las muestras se llaman A, B, C… en el orden en que las creó el dueño.
**Pregunta.** ¿Letras en orden está bien, o prefieres números al azar (tipo 347, 812) como en las
catas formales?
**Opciones.** (a) letras en orden · (b) números al azar por defecto · (c) elegir al crear la cata.
**Si no decides.** (a) ahora, (c) más adelante.
_(ref: K-crear-sesion-2)_

### A5 ◇ · Momentos de temperatura (caliente, templado, frío)
**Lo que vemos hoy.** La app no marca pasadas ni temperaturas; el catador puntúa cuando quiere.
**Pregunta.** ¿Debe la app proponer las tres pasadas (caliente / templado / frío) con un avisador, o
lo dejamos libre?
**Opciones.** (a) libre, como ahora · (b) un avisador opcional de tiempo · (c) guiar las tres pasadas.
**Si no decides.** (a).
_(brief cupping-protocol Q15)_

### A6 ◇ · Dónde empiezan los deslizadores de intensidad
**Lo que vemos hoy.** Un valor inicial en medio hace que «no lo toqué» parezca «medio».
**Pregunta.** ¿Los deslizadores deben empezar vacíos (sin valor hasta que el catador los mueve) o en
el punto medio?
**Opciones.** (a) vacíos · (b) en el medio.
**Si no decides.** (a).
_(brief Q11)_

### A7 ◇ · Descriptores que no están en la rueda y tope de cinco por sección
**Pregunta.** Cuando un alumno escribe un descriptor que no está en la rueda («romero»), ¿lo guardamos
tal cual, lo acercamos al término de la rueda más parecido, o lo dejas tú aprobar? Y el tope de cinco
descriptores por sección, ¿está bien para principiantes?
**Opciones.** Descriptor libre: (a) tal cual · (b) acercar a la rueda · (c) aprobación del profesor.
Tope: (a) cinco · (b) menos para principiantes · (c) más para expertos.
**Si no decides.** (b) y (a).
_(brief Q12, Q13)_

### A8 ◇ · Formato combinado: una pasada o dos
**Lo que vemos hoy.** Descriptivo y afectivo van en la misma pantalla, pestaña por pestaña.
**Pregunta.** ¿Prefieres que el combinado se haga en dos pasadas separadas (primero descriptivo de
todas las muestras, luego afectivo), como los formularios SCA en papel?
**Opciones.** (a) como ahora · (b) dos pasadas separadas · (c) que el dueño elija.
**Si no decides.** (a).
_(brief Q14)_

### A9 ◇ · Registrar tueste, molienda y dosis de la sesión
**Pregunta.** ¿Quieres que la cata registre los parámetros de preparación (fecha y nivel de tueste,
molienda, dosis, agua)?
**Opciones.** (a) nada · (b) solo fecha y nivel de tueste · (c) todos los parámetros SCA por sesión.
**Si no decides.** (b).
_(brief Q16)_

### A10 ◇ · Bandas de puntuación, propósito afectivo y palabras oficiales
**Pregunta.** Tres cosas cortas: ¿mostramos bandas («especialidad», etc.) o solo el número? ¿Debe el
alumno indicar para qué mercado puntúa (el CVA afectivo es relativo a un uso)? ¿Quieres que los nombres
de atributos y descriptores sigan al pie de la letra el formulario SCA en español?
**Opciones.** Bandas: (a) ninguna · (b) definidas por el profesor · (c) solo los anclajes 79 y 100.
Mercado: (a) no preguntar · (b) opcional · (c) obligatorio. Palabras SCA: (a) sí, exactas · (b) las
nuestras.
**Si no decides.** (a), (b), (a).
_(brief Q18, Q19, Q20)_

---

## B · Referencia, calibración y lo que ve el profesor

### B1 ⚑ · La referencia fijada en 79,00
**Lo que vemos hoy.** La muestra de referencia se cata primero y su calidad queda fijada en 5 en todos
los atributos, así todos la ven como 79,00. Eso no es práctica SCA documentada: es un invento nuestro.
**Pregunta.** ¿Es buena práctica de enseñanza o confunde?
**Opciones.** (a) mantenerla fija · (b) hacerla opcional al crear la cata · (c) referencia real, que
cada uno puntúa libremente, y comparar contra el promedio.
**Si no decides.** (a).
_(brief Q3; feature de 2026-09)_

### B2 ⚑ · Marcar como referencia una muestra que ya se puntuó
**Lo que vemos hoy.** Si a mitad de cata marcas como referencia una muestra que ya tiene notas, las
notas de todos se reemplazan por el 5 fijo sin avisar.
**Pregunta.** ¿Qué debe pasar con las notas ya dadas?
**Opciones.** (a) se reemplazan, pero avisando antes · (b) se guardan aparte y se puede volver ·
(c) no se puede marcar una muestra ya calificada.
**Si no decides.** (a).
_(ref: K-sesiones-1, F-sesiones-6)_

### B3 ⚑ · Con qué se compara al alumno
**Pregunta.** Cuando hay referencia, ¿qué comparación ayuda más al alumno?
**Opciones.** (a) diferencia contra la referencia · (b) contra el profesor · (c) contra el promedio del
grupo · (d) ninguna, solo su puntaje.
**Si no decides.** (a) y (c).
_(brief Q4)_

### B4 ⚑ · El puntaje del profesor: ¿clave de respuestas o uno más?
**Pregunta.** ¿Tu puntaje es una «respuesta correcta» que los alumnos ven después, o un catador más
dentro del promedio? ¿Y puede verse antes de que los alumnos envíen?
**Opciones.** (a) uno más, nunca antes · (b) clave visible solo después de enviar · (c) depende del
tipo de sesión (calibración vs. cata abierta), y el dueño lo marca al crearla.
**Si no decides.** (c).
_(brief Q5, Q6)_

### B5 ◇ · Ranking de alumnos en clase
**Pregunta.** ¿Está bien que exista un ranking de alumnos por cercanía al grupo?
**Opciones.** (a) el profesor ve nombres; los alumnos ven su posición anónima · (b) solo el profesor ·
(c) nadie.
**Si no decides.** (b).
_(brief Q9, Q10)_

### B6 ◇ · Repeticiones para calibrar
**Pregunta.** ¿Usas muestras repetidas en una tanda para ver si un catador es consistente? ¿Cuántas y
con qué tolerancia? ¿Te serviría que la app las detectara y mostrara la diferencia entre repeticiones?
**Opciones.** (a) no lo uso · (b) sí, mostrar solo la diferencia · (c) sí, calcular una nota de
consistencia.
**Si no decides.** (a).
_(brief Q8)_

### B7 ◇ · Referencia y calentamiento en «Catar ahora»
**Lo que vemos hoy.** El exprés abre directo la cata; no ofrece referencia ni Movimiento Sensorial.
**Pregunta.** ¿Debería poder llevarlos?
**Opciones.** (a) nunca, el exprés es solo impresión rápida · (b) un interruptor «más opciones» en la
misma pantalla · (c) solo el calentamiento.
**Si no decides.** (a).
_(ref: K-express-3; board ⚑)_

### B8 ◇ · Duplicar una cata con varias referencias
**Lo que vemos hoy.** Al duplicar una cata como plantilla solo se conserva la referencia activa (la
última); las anteriores se pierden.
**Pregunta.** ¿Una plantilla debe guardar todas las referencias?
**Opciones.** (a) todas · (b) solo la activa, como ahora.
**Si no decides.** (a).
_(ref: F-04-5; board ⚑)_

---

## C · La sesión mientras se cata (en vivo, a ritmo propio, exprés)

### C1 ⚑ · Cerrar con notas sin enviar
**Lo que vemos hoy.** Si el dueño cierra (o llega la fecha, o la cata exprés se cierra sola) y alguien
tiene una muestra puntuada pero sin pulsar «Enviar», esas notas se pierden en silencio. Pasa igual si
alguien cataba sin señal.
**Pregunta.** ¿Qué debe pasar con esas notas?
**Opciones.** (a) contarlas si están completas y avisar a esa persona · (b) dejarlas fuera, pero avisar
claramente antes (el día anterior en las asíncronas) y después · (c) no dejar cerrar hasta que todos
envíen o el dueño lo confirme expresamente · (d) guardarlas aparte y que el dueño decida si las acepta.
**Si no decides.** (b) + (d).
_(ref: K-grupal-1, K-grupal-asincrona-1, K-offline-1, F-offline-1, F-grupal-asincrona-1)_

### C2 ⚑ · Terminar una cata solo con muestras sin completar
**Pregunta.** Cuando catas solo y dejas una muestra sin las notas de calidad, ¿la app debe dejarte
cerrar igual, mantenerla abierta o exigir todo? ¿Y necesitas corregir un puntaje después de cerrar?
**Opciones.** (a) permitir cerrar y dejar esas muestras sin puntaje · (b) permitir enviar pero mantener
abierta hasta completar · (c) exigir todo antes de enviar. Corregir tras cerrar: sí / no.
**Si no decides.** (a) y no.
_(ref: K-solo-1, K-express-1)_

### C3 ⚑ · Catas en vivo olvidadas sin cerrar
**Lo que vemos hoy.** Una cata en vivo sin fecha de cierre que el dueño olvida cerrar queda activa para
siempre: nunca envía correos ni escribe el historial de los cafés.
**Pregunta.** ¿Cuánto tiempo sin actividad es razonable antes de recordárselo al dueño, y prefieres un
recordatorio o que se cierre sola?
**Opciones.** (a) recordatorio por correo a las 12 h, nunca cerrar sola · (b) recordatorio a las 24 h y
cierre automático a los 7 días · (c) como ahora.
**Si no decides.** (a).
_(ref: K-grupal-2; board ⚑; brief live-collab)_

### C4 ⚑ · Quién llega tarde
**Pregunta.** Si alguien se une cuando la cata en vivo ya empezó y las primeras muestras pasaron,
¿puede catar todo igual, solo las que faltan, o no debería entrar? ¿Quieres poder cerrar las entradas?
**Opciones.** (a) cata todo igual · (b) solo las que faltan · (c) no entra; el dueño puede cerrar las
entradas.
**Si no decides.** (a) + poder cerrar entradas.
_(ref: K-grupal-3)_

### C5 ⚑ · Cuándo ven el grupo los participantes
**Lo que vemos hoy.** En una cata de grupo, los participantes ven el puntaje del grupo en cuanto todos
los que se unieron hasta ese momento han enviado, aunque el dueño no haya cerrado. En una asíncrona eso
puede pasar días antes del cierre, con gente que aún no ha catado.
**Pregunta.** ¿Cuándo debe verse el grupo?
**Opciones.** (a) solo al cerrar (dueño o fecha) · (b) cuando cada uno envía lo suyo, aunque falten
otros · (c) el dueño decide al crear la cata.
**Si no decides.** (a).
_(ref: K-resultados-4, K-grupal-asincrona-2; brief results Q5)_

### C6 ◇ · Qué se congela al pulsar «Iniciar cata»
**Lo que vemos hoy.** Después de iniciar una cata en vivo se pueden cambiar las tazas por muestra, el
formato y añadir muestras; la pantalla de edición a veces falla por eso.
**Pregunta.** Una vez iniciada, ¿qué debe quedar fijo?
**Opciones.** (a) todo fijo · (b) solo se pueden añadir muestras · (c) como hoy.
**Si no decides.** (b).
_(ref: K-sesiones-2)_

### C7 ◇ · Fecha de cierre en catas en vivo
**Lo que vemos hoy.** Si a una cata en vivo le pones fecha de cierre, se convierte sin avisar en una
cata «a ritmo propio» (sin sala de espera ni «Iniciar cata»).
**Pregunta.** ¿Las catas en vivo deben poder tener una fecha de cierre automática, o eso es solo para
las de ritmo propio?
**Opciones.** (a) solo ritmo propio; en vivo se cierra a mano · (b) las dos.
**Si no decides.** (a).
_(ref: K-sesiones-4, F-sesiones-12)_

### C8 ◇ · El aviso por correo al grupo: al crear o al iniciar
**Lo que vemos hoy.** Cuando creas una cata para tu grupo, el correo sale al instante, aunque la cata
empiece días después.
**Opciones.** (a) al crear · (b) al iniciar · (c) que el maestro elija cada vez.
**Si no decides.** (b).
_(ref: K-grupos-2)_

### C9 ◇ · Reabrir una cata cerrada
**Pregunta.** Cerrar revela los cafés y envía correos. ¿Necesitas alguna vez reabrir una cata cerrada
(por ejemplo para que alguien termine), o basta con poder corregir el origen (ver D1)?
**Opciones.** (a) nunca reabrir · (b) reabrir solo si nadie ha recibido correo · (c) sí, siempre, con
aviso a todos.
**Si no decides.** (a).
_(brief live-collab; decisión aplazada en S6)_

---

## D · Resultados e informes

### D1 ⚑ · Corregir el origen después de cerrar
**Lo que vemos hoy.** El botón para completar finca/proceso/altitud de una muestra revelada aparece
después del cierre, pero nunca guarda. Es un error nuestro, y antes de arreglarlo hay que decidir.
**Pregunta.** ¿El dueño debe poder completar o corregir el origen tras cerrar?
**Opciones.** (a) sí, siempre: el origen no cambia ningún puntaje · (b) solo durante unos días ·
(c) no, queda cerrado. Y los informes de catas ya cerradas: (a) muestran el dato actual · (b) el del
día de la cata · (c) el actual con una nota «editado».
**Si no decides.** (a) y (c).
_(ref: K-resultados-1, K-cafes-2; board ⚑)_

### D2 ⚑ · Quitar a un catador de los resultados
**Pregunta.** ¿Por qué razones excluyes a alguien (error de muestra, no siguió el protocolo,
calibración)? ¿Se le avisa? ¿Puede hacerse después de cerrar, sabiendo que los resúmenes ya enviados
quedan con el número anterior?
**Opciones.** Razón: (a) lista fija · (b) texto libre. Avisar: sí / no. Tras cerrar: (a) sí ·
(b) no.
**Si no decides.** (a), no, (a).
_(ref: K-resultados-2; brief results Q3)_

### D3 ⚑ · Con cuántos catadores mostramos un promedio y cuándo «sin diferencia clara»
**Lo que vemos hoy.** Un «mejor café» puede salir con un solo catador, y dos muestras separadas por
0,25 puntos aparecen como 1.º y 2.º aunque el panel se disperse 2 puntos.
**Pregunta.** ¿Desde cuántos catadores mostramos promedio y dispersión? Si dos muestras están más cerca
que la dispersión del panel, ¿decimos «sin diferencia clara»? ¿Con qué diferencia en puntos?
**Opciones.** Mínimo: (a) desde 2 · (b) desde 3 con etiqueta «indicativo» hasta 5 · (c) solo desde 5.
Empates: (a) decir «sin diferencia clara» · (b) mostrar el orden igual.
**Si no decides.** (b) y (a) con media desviación del panel.
_(ref: K-resultados-3, K-informes-1; brief results Q1, Q2)_

### D4 ⚑ · Nombres de catadores en el análisis de la plataforma
**Pregunta.** Los administradores de la plataforma pueden ver el puntaje de cada catador con su nombre
en todas las catas. ¿Quién debería poder verlo?
**Opciones.** (a) solo el dueño de la cata, para sus propios catadores · (b) los administradores, con
nombre · (c) los administradores, con catadores anónimos («Catador 1, 2…») y sin grupos de menos de 3.
**Si no decides.** (c).
_(ref: K-insights-1)_

### D5 ◇ · Archivo de datos (Excel/CSV)
**Pregunta.** ¿Quieres descargar un archivo con el puntaje de cada catador por muestra? ¿Con nombres
para el dueño o solo códigos?
**Opciones.** (a) no hace falta · (b) sí, con nombres para el dueño · (c) sí, solo códigos.
**Si no decides.** (b).
_(ref: K-informes-2; brief results Q8)_

### D6 ◇ · Promedio de un café con catas abiertas o catadores excluidos
**Lo que vemos hoy.** La ficha de un café promedia también catas aún abiertas y catadores que el
anfitrión sacó de los resultados.
**Opciones.** (a) solo catas cerradas y sin excluidos · (b) también abiertas, marcadas «provisional».
**Si no decides.** (a).
_(ref: K-cafes-1, F-cafes-2)_

### D7 ◇ · Quién ve la lista de un grupo
**Lo que vemos hoy.** Todos los miembros ven la lista del grupo con el correo parcialmente tapado.
**Opciones.** (a) todos ven nombres · (b) solo los nombres que el maestro decide mostrar · (c) solo el
maestro ve la lista.
**Si no decides.** (a).
_(ref: K-grupos-1)_

### D8 ◇ · Borrar una cata a ciegas antes de revelar
**Lo que vemos hoy.** Si cancelas una cata ciega antes de revelar, los catadores ven en su historial qué
café era cada muestra.
**Opciones.** (a) no: solo «Muestra B» · (b) sí, se revela · (c) sin fila de historial.
**Si no decides.** (a).
_(ref: K-sesiones-3)_

---

## E · Invitados, cuentas y aparatos en la mesa

### E1 ⚑ · Teléfono propio o tableta compartida
**Pregunta.** En tus catas, ¿cada catador entra desde su propio teléfono o se comparte una tableta en
la mesa? Si se comparte, ¿prefieres que al abrir el QR la pantalla pregunte «¿Eres Pepe?» antes de
entrar? ¿Y el organizador suele estar conectado en dos aparatos a la vez?
**Opciones.** (a) cada uno su teléfono; «Salir» cierra solo ese aparato · (b) a veces compartido:
preguntar «¿Eres Pepe?» · (c) ambas cosas.
**Si no decides.** (c).
_(ref: K-guest-1, K-cuenta-2)_

### E2 ⚑ · Catas grandes: aforo y correo de los asistentes
**Lo que vemos hoy.** Un evento de 50 personas en la misma Wi-Fi puede chocar con el límite de entradas
de invitados; hoy nadie lo planifica. Y el invitado que cierra el navegador sin guardar pierde su cata.
**Pregunta.** Para la próxima cata grande: ¿cuántas personas y desde la misma red? ¿Te sirve pedir el
correo al entrar (para enviarles resultados y que no pierdan su cata) o prefieres que sigan anónimos
hasta que decidan guardar?
**Opciones.** (a) seguir sin correo al entrar; guardar al final como ahora · (b) correo opcional al
entrar · (c) correo obligatorio al entrar.
**Si no decides.** (b).
_(ref: K-guest-2; board ⚑ email antes de unirse)_

### E3 ◇ · Si el organizador borra su cuenta
**Pregunta.** Si quien organizó una cata borra su cuenta, ¿los resultados deben seguir viéndose para
quienes la catearon?
**Opciones.** (a) sí, se conservan sin el nombre del organizador · (b) se pasan a otro participante ·
(c) se borran para todos.
**Si no decides.** (a).
_(ref: K-cuenta-1)_

### E4 ◇ · Correo perdido
**Pregunta.** Cuando un profesor pierde su correo de la escuela, ¿qué esperas que pase con su historial?
**Opciones.** (a) puede cambiar el correo él mismo · (b) lo vinculamos a su cuenta de Google · (c) lo
resolvemos a mano contigo.
**Si no decides.** (a) + (c).
_(ref: K-cuenta-3)_

### E5 ◇ · Catar sin señal
**Pregunta.** ¿Con qué frecuencia catáis en sitios sin señal? ¿Necesitas crear la cata entera sin
internet (y que suba después) o basta con poder seguir catando si se cae la red a mitad?
**Opciones.** (a) casi nunca; basta un aviso claro · (b) a veces; seguir catando si se cae · (c) a
menudo; crear la cata sin internet.
**Si no decides.** (b).
_(ref: K-04-1; memo app nativa)_

---

## F · Movimiento Sensorial

### F1 ⚑ · Cuándo se hace el movimiento
**Lo que vemos hoy.** Quien no lo hizo en la sala de espera lo ve al entrar a la mesa, con los cafés ya
enfriándose (3–7 minutos).
**Opciones.** (a) solo antes del agua; después se ofrece como opcional discreto · (b) siempre, como
ahora · (c) el catador elige «hacerlo luego».
**Si no decides.** (a).
_(ref: K-movimiento-sensorial-1)_

### F2 ◇ · Las dos respuestas al final
**Pregunta.** Al cerrar el ejercicio se invita a escribir dos respuestas. ¿Quieres que cada catador
pueda volver a leerlas?
**Opciones.** (a) guardarlas por persona y poder verlas · (b) no guardarlas.
**Si no decides.** (b).
_(ref: K-movimiento-sensorial-2)_

### F3 ◇ · Qué prometemos que hace el ejercicio
**Pregunta.** ¿«Asentarte y concentrarte» o «despertar los sentidos»? Lo segundo no tiene respaldo
publicado; lo primero sí, parcialmente.
**Opciones.** (a) calmar y enfocar · (b) ritual previo a la cata · (c) mantener la frase actual porque
tú lo observas en tus catadores.
**Si no decides.** (a).
_(ref: K-movimiento-sensorial-3)_

### F4 ◇ · Interrupciones y versiones cortas
**Pregunta.** Si alguien se interrumpe a mitad de ejercicio, ¿retoma donde estaba, repite el paso o lo
deja? ¿Y quieres una versión corta (1–2 minutos) para cuando hay prisa?
**Opciones.** Interrupción: (a) retomar · (b) repetir el paso · (c) salir. Versión corta: sí / no.
**Si no decides.** (a) y sí.
_(brief guided Q2, Q4)_

### F5 ◇ · En grupo, todos a la vez o cada uno libre
**Pregunta.** En una cata en grupo, ¿todos hacen el ejercicio al mismo tiempo con el teléfono del
maestro sonando, o cada uno puede saltárselo sin afectar a los demás? ¿Y hay movimientos que alguien
deba poder sustituir (lesión, sentado, poco espacio)?
**Opciones.** (a) todos a la vez; se puede saltar en silencio · (b) cada uno libre. Sustituir: sí / no.
**Si no decides.** (a) y sí.
_(brief guided Q5, Q8)_

---

## Formato del archivo de respuestas

Tu Claude debe generar `respuestas-kim-2026-11.md` con esta estructura exacta (está también en
`02-respuestas-kim-plantilla.md`):

```markdown
# Respuestas de Kim — flujos de Café Sensible (noviembre 2026)

fecha: 2026-11-__
respondido por: Kim

## A · Cómo se cata
| Código | Respuesta | Comentario de Kim |
|---|---|---|
| A1 | a | … |
| A2 | b | … |
…

## B · Referencia y calibración
…

## C · La sesión mientras se cata
…

## D · Resultados e informes
…

## E · Invitados, cuentas y aparatos
…

## F · Movimiento Sensorial
…

## Dudas que me quedaron
- …

## Cosas que no me preguntaron y quiero decir
- …
```

Una fila por pregunta (A1–A10, B1–B8, C1–C9, D1–D8, E1–E5, F1–F5 = 45). Si Kim no respondió una,
escribe «(sin responder)». Copia sus comentarios tal cual, sin resumir.
