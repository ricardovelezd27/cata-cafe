# S4 — Higiene de resultados y deuda técnica pequeña

> Prompt listo para pegar en una sesión nueva de Claude Code (rama nueva desde `main`).
> Independiente; se puede ejecutar en cualquier momento. Sin cambios de comportamiento.

---

Context: Café Sensible (see CLAUDE.md, DESIGN.md). Small hygiene batch found during the 2026-09 audit; no behaviour change intended. Do these, each as its own commit, verifying tsc + lint + npm test after each:
1. lib/scoring.ts scoreBand() is the single source of score bands, but components/ui/Badge.tsx ScorePill hardcodes the 85/75 thresholds — make ScorePill call scoreBand().
2. components/dashboard/FormatBadge.tsx uses hex literals and hardcoded Spanish labels — rebuild it on components/ui/Badge with MD3 tokens and a translations prop (callers pass labels from session.format.* keys; add keys es/en if missing).
3. SampleResult is declared three times (app/[locale]/app/sessions/[id]/results/types.ts is canonical; private copies in components/results/SampleRadarChart.tsx and OwnerParticipantSection.tsx) — import the canonical type; delete the copies.
4. Hardcoded Spanish strings in components/results/SampleRadarChart.tsx ("Revelar", "Puntuación comunidad", "Sin datos afectivos registrados") → results.* i18n keys es/en, threaded through the existing t prop.
5. Lint baseline: 4 errors / 7 warnings (IntensitySlider refs-in-render etc.). Fix them properly (no eslint-disable) so a future CI can run eslint blocking. Show the before/after `npm run lint` output.
6. README.md "Dev Commands" is missing `npm test`; add it and note that `npx prisma migrate dev` is for the dev/staging DB only, `migrate deploy` for production (docs/LAUNCH-RUNBOOK.md §2).
Do not touch scoring logic, the SQL trigger, or any auth path. Run `npm test`, `npx tsc --noEmit`, `npm run lint` at the end and report the outputs verbatim.
