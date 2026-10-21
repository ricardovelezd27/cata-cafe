# Informes y PDFs — niveles y backlog (S6, 2026-10)

## Decisión
- **Nivel = permiso, no cobro.** Hoy no hay facturación; el nivel se deriva del rol en la sesión.
  Cuando exista un plan de pago, se añade `Profile.plan` y el route de la ficha lo comprueba
  además de `createdBy`.
- **Participante (gratis):** *Resumen del participante* — sus números frente al grupo anónimo
  (puntaje propio vs comunitario ± DE, Δ vs referencia, radar, descriptores más frecuentes con
  marca "tú", frase de consenso, sus notas). Llega adjunto en el email de cierre y se descarga
  desde Resultados ("Mi resumen (PDF)").
- **Propietario (pago futuro):** *Ficha técnica* — identidad + origen + verde (tabla completa de
  defectos y mallas) + afectiva (puntaje comunitario, DE, radar, medias por atributo,
  penalizaciones) + descriptiva (barras por bloque, consenso, intensidades medias) +
  participación, apéndice con matriz catador×muestra (bandas DE) y ranking de alineación, y
  **Notas del profesor v1** (una página por catador: puntaje vs grupo, alineación, descriptores
  de consenso que no marcó / propios fuera del consenso, líneas para notas a mano).
- **Ficha de café** (`/api/coffees/[id]/ficha`): identidad + origen + bloque entre sesiones
  (si `resultsPublished` o propietario).

## Lo que Kim debe revisar
1. ¿El resumen del participante dice lo que un alumno necesita después de la cata?
2. ¿La ficha técnica sirve como informe para terceros (importador, productor)?
3. Etiquetas en inglés de origen/verde (traducidas desde `cvaFormData`, borrador).

## Backlog (v2)
- Notas del profesor con texto libre: tabla `cupper_notes` (sessionId, cupperId, authorId,
  body) — anotación del propietario permitida tras el cierre (excepción documentada a
  "cerrado = solo lectura"); añadir a `mergeGuestData`. Gated por el mapa de flujos.
- Comparación ficha ↔ percepción del grupo (qué coincide con la hoja extrínseca) — depende de
  la unificación extrínseca ↔ café (S6 gated).
- Plan de pago (`Profile.plan`) y marca de agua "borrador" para el nivel gratuito si se decide.
