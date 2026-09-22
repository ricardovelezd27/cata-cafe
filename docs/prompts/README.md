# Prompts para sesiones separadas

Cada archivo es un prompt autocontenido para una sesión nueva de Claude Code. Contienen
los hallazgos de la auditoría de 2026-09-22 para que la sesión no tenga que re-explorar.

| Archivo | Cuándo | Qué entrega |
|---|---|---|
| `S2-staging-production.md` | Después de desplegar la muestra de referencia | Entorno staging (2º proyecto Supabase + Vercel Preview en rama `staging`), proceso de migraciones dev → staging → prod, CI, `.env.example`, bootstrap SQL para proyectos nuevos, checklist de dominio/HTTPS para cafesensible.ai, smoke test §5 |
| `S3-radar-reference-overlay.md` | Solo tras validar la referencia en la cata de fin de mes | Radar con tres polígonos (yo / referencia / grupo) y Δ por atributo |
| `S4-results-hygiene.md` | Cualquier momento | Limpieza: ScorePill usa scoreBand, FormatBadge con tokens, tipo SampleResult único, strings en español hardcodeados → i18n, baseline de lint a cero, README |

Orden recomendado: S2 → (cata) → S3 si procede. S4 cuando haya un hueco.
