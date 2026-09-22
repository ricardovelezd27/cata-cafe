# Prompts para sesiones separadas

Cada archivo contiene **el prompt listo para pegar** en una sesión nueva de Claude Code **y el plan
de implementación completo** (fases, archivos, criterios de aceptación, pasos manuales, riesgos y
definición de hecho). Incluyen los hallazgos de la auditoría del 2026-09-22 para que la sesión no
tenga que re-explorar el repositorio. El agente de esa sesión debe leer el archivo entero, no solo
el bloque del prompt.

| Archivo | Cuándo | Qué entrega | Necesita de Ricardo |
|---|---|---|---|
| `S2-staging-production.md` | Después de desplegar la muestra de referencia | Entorno staging (2º proyecto Supabase + Vercel Preview en rama `staging`), discriminador `lib/appEnv.ts`, crons/email/robots inertes en staging, guardas de scripts y `db:migrate:prod`, CI en GitHub Actions, `bootstrap_fresh_project.sql`, `scripts/verify-env.ts`, `docs/ENVIRONMENTS.md`, cutover DNS/HTTPS a cafesensible.ai, smoke test §5 | Crear proyecto Supabase, variables en Vercel, DNS, ejecutar el smoke test |
| `S3-radar-reference-overlay.md` | Solo tras validar la referencia en la cata de fin de mes | Radar con tres polígonos (yo / referencia / grupo), `lib/attributeDelta.ts`, token de color `tertiary`, columna "Δ ref", help reescrito | Una decisión de producto al inicio (qué es "referencia" en sesión grupal) |
| `S4-results-hygiene.md` | Cualquier momento; mejor antes de S2 y S3 | ScorePill usa `scoreBand`, FormatBadge con tokens, un solo tipo `SampleResult`, strings fijos → i18n, lint a cero, README | Revisar el PR |

Orden recomendado: **S4 → S2 → (cata de fin de mes) → S3 si procede.** S4 primero deja el lint a
cero, lo que permite que la CI de S2 sea bloqueante desde el primer día.
