# Prompts para sesiones separadas

> La lista consolidada y priorizada de todo lo pendiente está en `docs/BACKLOG.md`; los prompts de aquí son los planes detallados de los ítems grandes.

Cada archivo contiene **el prompt listo para pegar** en una sesión nueva de Claude Code **y el plan
de implementación completo** (fases, archivos, criterios de aceptación, pasos manuales, riesgos y
definición de hecho). Incluyen los hallazgos de la auditoría del 2026-09-22 para que la sesión no
tenga que re-explorar el repositorio. El agente de esa sesión debe leer el archivo entero, no solo
el bloque del prompt.

| Archivo | Cuándo | Qué entrega | Necesita de Ricardo |
|---|---|---|---|
| `S2-staging-production.md` | Después de desplegar la muestra de referencia | Entorno staging (2º proyecto Supabase + Vercel Preview en rama `staging`), discriminador `lib/appEnv.ts`, crons/email/robots inertes en staging, guardas de scripts y `db:migrate:prod`, CI en GitHub Actions, `bootstrap_fresh_project.sql`, `scripts/verify-env.ts`, `docs/ENVIRONMENTS.md`, cutover DNS/HTTPS a cafesensible.ai, smoke test §5 | Crear proyecto Supabase, variables en Vercel, DNS, ejecutar el smoke test |
| `S3-radar-reference-overlay.md` | Solo tras validar la referencia en la cata de fin de mes | Radar con tres polígonos (yo / referencia / grupo), `lib/attributeDelta.ts`, token de color `tertiary`, columna "Δ ref", help reescrito | Una decisión de producto al inicio (qué es "referencia" en sesión grupal) |
| `S5-kim-2026-09-25.md` | A partir del 2026-09-28, después de la cata de calibración | Backlog de la reunión con Kim: nube de descriptores (una palabra, suma por etapa, desglose al pasar el ratón), descriptor propio archivado bajo grupo/subgrupo, Ritual vs Calibración + checklist de materiales, tres «objetivos» de cata (spec), ejercicios previos, realtime de muestras, re-fijar referencia al cambiarla, fecha de cierre editable, exportar CSV en Usuarios | Decisiones de producto ⚑ (ítems 2C, 3, 4); texto de Kim (ítems 3 y 5) |
| `S6-kim-2026-10.md` | Desde el 2026-10-20 (aprobado) | Cinco streams en worktrees paralelos: **A** informes/PDF (fuentes + fuga de datos físicos, resumen del participante, ficha técnica, notas del profesor v1, email con enlace), **B** ejercicios Movimiento Sensorial (figuras SVG animadas, reproductor, `/app/warmup`, paso opcional pre-cata + overlay de "momentos"), **C** pantalla de cata en móvil + re-fijar referencia + higiene de sesión + realtime de muestras, **D** descriptores (Excel para Kim, nube S5#1 + toggle de únicos, roll-up a grupos, archivar bajo, diccionario de sinónimos), **E** landing, búsqueda de cafés, inglés, memo app nativa, CSV usuarios. Absorbe S5 ítems 1,2,5,6,8,9,10. | Capturas iPhone de Kim (C0), `migrate deploy` (B6), elegir titular hero (E1), sign-off de Kim en A3/A4 y D4 |
| `S4-results-hygiene.md` | Cualquier momento; mejor antes de S2 y S3 | ScorePill usa `scoreBand`, FormatBadge con tokens, un solo tipo `SampleResult`, strings fijos → i18n, lint a cero, README | Revisar el PR |
| `../product/sca-2004-form.md` | **Compuerta: conversación de Kim con Bruno** (decisión 2026-10-21: solo memo, no se construye) | Memo de especificación del formulario SCA 2004 (campos y puntuación verificados contra el protocolo SCAA abril 2005), mapeo contra el módulo afectivo CVA, reutilización vs. novedad, por qué 2004 y CVA nunca se mezclan en `AggregateScore`/trigger, opción A (`SESSION_FORMATS` 4.º valor `sca2004`, ~12–15 d) vs B (módulo separado, ~19–24 d), impacto en resultados/PDF/email, preguntas para Bruno y decisiones ⚑. Si se aprueba, se convierte en `S7-sca2004.md` | Que Kim hable con Bruno; decidir ⚑ construir / opción A·B / v0 sin comunidad |

Orden recomendado: **S6 (E → C → D → B → A; A0/A2 pueden ir antes) → S4 → S2 → S3 si procede** S4 primero deja el lint a
cero, lo que permite que la CI de S2 sea bloqueante desde el primer día.
