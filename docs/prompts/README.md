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
| `S4-results-hygiene.md` | Cualquier momento; mejor antes de S2 y S3 | ScorePill usa `scoreBand`, FormatBadge con tokens, un solo tipo `SampleResult`, strings fijos → i18n, lint a cero, README | Revisar el PR |

Orden recomendado: **(cata 2026-09-26) → S5 ítem 1 → S4 → S2 → S3 si procede; el resto de S5 según prioridad de Kim.** S4 primero deja el lint a
cero, lo que permite que la CI de S2 sea bloqueante desde el primer día.
