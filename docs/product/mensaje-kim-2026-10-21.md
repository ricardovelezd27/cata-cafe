# Mensaje para Kim — qué cambió en la app (ronda S6, 20–21 oct 2026)

Hola Kim. Resumen de lo que implementamos a partir de tus dos reuniones (debrief de la
calibración y la del 9 de octubre), tu nota de copy y el documento de Movimiento Sensorial.
Casi todo ya está en producción; lo que falta por publicar lo marco con ⏳.

## Informes y PDF (tu prioridad número uno)
- **Encontramos la causa de las "letras mezcladas".** No eran las fuentes: una caja del
  formulario CVA se colapsaba y los descriptores se pintaban encima de las reglas de intensidad.
  Pasaba desde que existe el formulario. Está corregido ⏳ (sale con la siguiente publicación).
- **Nuevo "Resumen del participante" (PDF, gratis).** Cada catador ve sus números frente al
  grupo anónimo: su puntaje vs el comunitario con la desviación, la diferencia con la referencia,
  radar propio vs grupo, los descriptores más votados marcando los que él también eligió, la
  frase de consenso y sus notas. Se descarga desde Resultados ("Mi resumen") y llega adjunto en
  el correo de cierre. ⏳
- **Nueva "Ficha técnica" (PDF, solo el propietario).** Por muestra: identidad y código del
  café, datos de origen, análisis de verde (tabla completa de defectos y mallas), afectiva
  (puntaje comunitario, desviación, radar, medias por atributo, penalizaciones), descriptiva
  (barras por bloque, consenso, intensidades medias), participación; apéndice con la matriz
  catador×muestra y el ranking de alineación; y **"Notas del profesor"**: una página por catador
  con su puntaje vs grupo, su alineación, los descriptores de consenso que no marcó y los suyos
  fuera del consenso, con líneas para anotar a mano. ⏳
- **Ficha del café (PDF)** descargable desde el perfil del café. ⏳
- **Correo de cierre:** ya no manda los dos PDF; lleva un botón "Ver mis resultados" que entra
  en la app y adjunta solo el resumen personal. ⏳

## Cata en el móvil
- La pantalla de cata en iPhone pierde ~40 % del espacio que ocupaba arriba (180 → 107 px) y
  se pliega mientras escribes. **Te pido que lo pruebes en tu iPhone.**
- Si cambias la referencia a mitad de cata, las evaluaciones ya guardadas de la nueva referencia
  se fijan en 79 como las demás (antes quedaban con lo que cada uno había puesto).
- Fecha de cierre editable después de crear la sesión; una sesión cerrada ya no acepta cambios.
- Muestras añadidas o renombradas por el maestro aparecen a los catadores sin recargar. ⏳
- **Hallazgo importante:** el "tiempo real" no funcionaba para nadie (el canal se conectaba sin la
  identidad del usuario y no recibía nada). Explica el "los datos tardan en salir". Corregido. ⏳

## Descriptores
- **Nube:** una palabra por descriptor, tamaño = suma de menciones en todas las etapas, al tocar
  muestra el desglose ("Fragancia 3 · Aroma 2"), y un botón para **ocultar los descriptores de
  una sola persona** (por defecto se ven todos, como pediste).
- Las palabras libres se agrupan en su familia de la rueda ("lulo" suma a Frutal) y aparecen en
  pequeño bajo su grupo.
- **"Archivar bajo":** al escribir una palabra que no está en la rueda, un botón abre la rueda
  para guardarla bajo el grupo que elijas; "Otros" queda como último recurso y, antes de enviar,
  un aviso recuerda cuántas quedaron en Otros. (Un detalle lo impedía aparecer; sale corregido ⏳.)
- **Diccionario de sinónimos** (frutas latinoamericanas, especias, términos de vino y
  fermentación): está hecho pero **necesita tu revisión antes de activarlo** (ej.: uchuva → bayas,
  damasco → durazno, tropicales → "Otra fruta").
- **Excel con todos los descriptores** (rueda, acidez, dulzor, sensación) para que revises:
  te lo paso.

## Movimiento Sensorial
- Los cinco ejercicios están en la app (`Inicio → Movimiento Sensorial`): ficha de cada uno con
  tu texto literal, postura, evolución (rápido · lento · ojos cerrados), regla de seguridad, y un
  reproductor paso a paso con figura animada, cuenta de 15 s, pausas de 3 s, observa y las dos
  preguntas de cierre. Funciona para invitados.
- ⏳ Opcional al crear una sesión: elegir un ejercicio para que aparezca antes de la primera
  muestra (se puede saltar).
- **Lo que viene (v2):** guía por sonido/voz y vibración para hacerlo con los ojos cerrados, un
  anillo de respiración en lugar del cronómetro, figura más sobria, las frases de "observa"
  durante el movimiento y una pantalla de reflexión final. **Decisiones tuyas:** (1) permiso
  para reproducir los ejercicios con tu nombre; (2) si grabas tú la voz; (3) texto exacto de las
  dos preguntas de cierre; (4) duración de la versión pre-cata (2–5 min).

## Landing y otros
- Landing con tu copy (subtítulo del Método, pasos, IA, "Sin tarjeta. Sin contraseña. Solo tu
  correo.") y botón "Entrar" visible en móvil. Titular: "El paladar de tu grupo, calibrado y medido."
- Buscador de cafés por finca, productor y proceso; filtro por variedad.
- Exportar CSV de usuarios desde Insights.
- Pantalla de bienvenida traducida; marca "Café Sensible" en correos y PDF.
- Memo sobre app nativa: para Madrid, PWA; Capacitor solo si hace falta estar en las tiendas.

## Te pedimos
1. Probar `/cup` en tu iPhone (teclado y espacio arriba).
2. Mirar los dos PDF nuevos (resumen y ficha) y decirnos qué sobra y qué falta.
3. Revisar el diccionario de sinónimos y el Excel de descriptores.
4. Las cuatro decisiones de Movimiento Sensorial.
