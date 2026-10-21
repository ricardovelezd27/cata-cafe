# Entrevistas con beta testers — octubre 2026

> Plan de entrevistas de 30 minutos con unos 5 beta testers. Objetivo: entender qué
> necesita cada persona para usar Cata Café de verdad, no validar lo que ya
> construimos. Las notas viven en `docs/notes/beta/`.

## Propósito

Acordado el 2026-10-15 entre Ricardo Vélez y Kim Ossenblok. Queremos responder tres
preguntas antes de priorizar el siguiente trimestre:

1. ¿Qué formato de cata usa cada persona y por qué?
2. ¿Qué bloquea el uso de la app hoy: el flujo, el móvil, el formato o la confianza en el puntaje?
3. ¿Qué tendría que pasar para que la usen la semana siguiente a la entrevista?

Las entrevistas son separadas, en los huecos de tarde del jueves o viernes que Kim
reserva en su página de Google Calendar (30 min cada una). Conducción: Kim o Ricardo,
por confirmar. Ricardo toma notas en las que estén presentes los dos.

## Participantes

| Persona | Perfil | Qué queremos aprender |
|---|---|---|
| Jordi | Usuario de CVA | Cómo encaja el formulario CVA en su flujo real, qué sobra y qué falta en la app. |
| Bruno | Brasil, Q-Grader trainer, crítico del CVA | Su postura frente al CVA y al formulario SCA de 2004. Es probable que la conversación sea sobre todo filosófica. Kim puede hacerla sola. |
| Francisco | Muy activo en la comunidad, entusiasta | Qué le entusiasma, qué no termina de entender y qué explicación le funciona. Conviene explicar los conceptos despacio. |
| Rina Paguaga | EE. UU. / Nicaragua, dueña de finca, catadora experimentada | Catas de finca y de comprador: formato, notas de campo, qué datos quiere ver. |
| Por definir | Quinto participante | Se elige para cubrir un perfil que falte (p. ej. catador de tienda o tostador). |

## Guion (30 minutos)

**0:00–0:05 · Contexto (5 min)**
- Presentarnos. Explicar que no es una prueba: no hay respuestas incorrectas y la app no se evalúa a sí misma.
- Pedir permiso para tomar notas. Preguntar si prefiere hablar en español o en inglés.

**0:05–0:15 · "Muéstrame cómo catas hoy" (10 min)**
- Observar sin intervenir. Pedir que catan como lo harían normalmente, con sus formularios, papel, hojas o apps.
- Anotar herramientas, pasos y dónde escriben.

**0:15–0:25 · Recorrido en su teléfono (10 min)**
- Usar su teléfono, no el nuestro. Pedir que hable en voz alta mientras lo hace.
- Tarea: crear una sesión y catar una muestra. No dar pistas salvo que la persona quede bloqueada más de un minuto.

**0:25–0:30 · "¿Qué te haría usarla la próxima semana?" (5 min)**
- Preguntar qué necesitaría ver para usarla en su siguiente cata. Cerrar agradeciendo y confirmando que habrá seguimiento.

## Preguntas específicas

- **Formato.** ¿Usas descriptivo, afectivo o combinado? ¿Por qué ese y no otro? ¿Cambia según el cliente o el objetivo?
- **Formulario SCA antiguo (2004).** ¿Sigues usándolo? ¿Para qué: registro, comparación, certificado, cliente? ¿Lo necesitas impreso o en PDF?
- **Catar ahora (feria, visita a finca, cliente en el momento).** ¿Haces catas improvisadas? ¿Cuántas muestras y personas? ¿Qué necesitas ver en ese momento y qué te sobra?
- **Notas.** ¿Dónde tomas notas hoy: papel, Excel, WhatsApp, otra app? ¿Cuánto tardas en pasarlas a limpio? ¿Quién las lee después?
- **Bloqueos.** ¿Qué te ha impedido usar la app hasta ahora? ¿Te frenó el registro, el móvil, el formato, el idioma o la confianza en el puntaje? ¿Hubo un momento en que lo dejaste?

## Checklist de observación

Marcar durante la tarea del teléfono. Anotar la hora con segundos cuando sea posible.

- [ ] Tiempo para crear una sesión en el móvil, desde abrir la app hasta crearla: ___ s
- [ ] Pasos donde duda más de 5 segundos (pantalla y campo): ___
- [ ] Errores que aparecen (texto exacto, pantalla, paso): ___
- [ ] Problemas de móvil: zoom, scroll, teclado que tapa campos, botones pequeños: ___
- [ ] Términos que no entiende (en español): ___
- [ ] Pregunta a alguien o busca ayuda fuera de la app: sí / no
- [ ] Punto donde abandona, si lo hace: ___
- [ ] Frases textuales relevantes (entre comillas): ___

## Dónde van las notas

- Un archivo por entrevista en `docs/notes/beta/<nombre>-<fecha>.md`, con la fecha en formato `AAAA-MM-DD`.
  Ejemplo: `docs/notes/beta/jordi-2026-10-22.md`. La carpeta se crea con el primer archivo.
- Primera línea de cada archivo, con esta plantilla:

```
- **<Nombre>** · <AAAA-MM-DD> · formato: <descriptivo | afectivo | combinado> · bloqueo principal: <...> · siguiente paso: <...>
```

- No incluir correos ni datos de contacto en las notas. Usar solo el nombre de pila.
- Las notas son material de trabajo interno. No se publican ni se comparten fuera del equipo.
