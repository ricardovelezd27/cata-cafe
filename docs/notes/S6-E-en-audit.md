# S6-E: i18n bypass audit (read-only)

Scope: `components/`, `app/` (excluding `app/generated`), `lib/pdf/`, `lib/closeEmail.ts`, `lib/insightsDigestEmail.ts`, `app/actions/groups.ts`, `lib/ai/narratives.ts`, `lib/email.ts`.
Excluded: `messages/*.json`, `lib/constants.ts`, tests, scripts, comments, console/log text, identifiers, `components/landing/journey/**`.

Method: accent-character search (`áéíóúñ¿¡`) over every in-scope path, plus an unaccented Spanish stopword/keyword sweep over `components/`, `lib/closeEmail.ts`, `lib/insightsDigestEmail.ts`, `lib/pdf/`. The unaccented sweep was not run exhaustively over `app/`, so unaccented Spanish there is under-counted.

Status key: **V** = user-visible. **D** = dev-only route or dev action. **I** = intentional bilingual locale map (ES/EN keyed by locale, but still outside `messages/`). **C** = comment or identifier, listed only for completeness.

## (1) Spanish literals table

### 1a. Email and server-side user-facing text

| file:line | literal | user-visible? | suggested fix |
|---|---|---|---|
| lib/closeEmail.ts:40 | `Resultados — ${name}` (subject) | V (EN-less, ES only) | Move to `messages/*.json` under an `emails.close.*` namespace; render by recipient locale. |
| lib/closeEmail.ts:46-51 | "Hola," / "La sesión de catación… se ha cerrado." / "Tu formulario CVA individual" / "Resumen grupal" | V (ES only, no locale branch) | Same as above; add EN strings. |
| lib/insightsDigestEmail.ts:46, 59 | subject "Cata Café — Resumen de insights" / "Insights digest" | V | Already has ES/EN map; move into `messages/`. Intentional-bilingual (I). |
| lib/insightsDigestEmail.ts:50 | "Cafés nuevos" | V | Same as above (I). |
| lib/insightsDigestEmail.ts:55-56 | "Abrir el panel de insights" / "Resumen generado con IA…" | V | Same as above (I). |
| app/actions/groups.ts:221-235 | invite email subject, intro, CTA, footer (ES + EN) | V | Keyed by locale but inline in the action file; move to `messages/` under `emails.groupInvite`. (I) |
| app/actions/groups.ts:611-621 | "Unirse a la sesión" / "Abrir Cata Café" / footer (ES + EN) | V | Same as above (I). |
| app/actions/groups.ts:799-812 | "Nueva sesión de catación: …" / "Te invito a una sesión…" / "Unirme a la sesión" / footer (ES + EN) | V | Same as above (I). |
| app/actions/dev.ts:32, 38 | `[DEV] Sesión de prueba`, `[DEV] Café de prueba` | D (persisted data names) | Acceptable in dev; move to a dev-only string map if they ever show in prod. |
| app/actions/dev.ts:52 | "Error al crear la sesión. Intenta de nuevo." returned to the client | V | Return an `ActionResult` error code and map it through `errors.codes`. |
| lib/email.ts:44 | `DEFAULT_FROM = "Cata Café <no-reply@catacafe.app>"` | V (sender display name) | Brand/config value, not translatable. Keep, but confirm it is intended. |

### 1b. PDF documents

| file:line | literal | user-visible? | suggested fix |
|---|---|---|---|
| lib/pdf/cvaFormData.ts:51-104 | locale label map (ES side of `Evaluación descriptiva`, `Propósito`, `Sensación en boca`, `Gustos básicos (2)`, …) | V | Already a locale map in the data layer. Keep the map, but move the strings into `messages/` so the PDF and UI share one source. (I) |
| lib/pdf/cvaFormData.ts:566-579 | extrinsic labels `País`, `Región`, `Clasificación`, `Tamaño del lote` | V | Same as above. |
| lib/pdf/cvaFormData.ts:108 | footer "Formato basado en el SCA Coffee Value Assessment v1.1… Documento derivado generado por Cata Café…" | V | Already has EN at :184 (I). Move both to `messages/`. |
| lib/pdf/GroupSummaryDocument.tsx:38, 44 | "Café", "Resumen estadístico anónimo de la sesión. Los datos son agregados…" | V | Verify whether these sit in a locale map; if not, move to `messages/`. |
| lib/pdf/InsightsReportDocument.tsx:80-101 | "Principales orígenes", "Distribución de puntajes", "Descriptores más frecuentes", "Cafés registrados", "Cafés catados", "Sin datos todavía", "Comparación orientativa: metodologías distintas (CVA vs. SCA)." | V | Locale map (I). Move to `messages/`. |

### 1c. UI components

| file:line | literal | user-visible? | suggested fix |
|---|---|---|---|
| components/groups/CoCupperCard.tsx:16-22 | `hace 1 día`, `hace ${days} días`, `hace 1 año`, `hace ${years} años` | V | Replace with ICU plural keys in `messages/` and `t()`. |
| components/groups/CoCupperCard.tsx:64-69 | "sesión"/"sesiones", "cata"/"catas", "Última sesión:" | V | ICU plural via `t()`. |
| components/groups/GroupActivityFeed.tsx:11-18 | relative-time strings inline with `es ? … : …` ternary | V | Same fix. The ternary is an i18n bypass pattern and should move into messages. |
| components/coffees/CoffeesTable.tsx:117-120 | process keys `Anaeróbico`, `Maceración Carbónica`, `Láctico`, `Co-fermentación` | Probably data keys, not labels. Verify | If shown to users, translate through a lookup in `messages/` or `lib/constants.ts`. |
| components/cupping/AffectiveForm.tsx:165, 28 | "Impresión Global"; notScored "Se registra pero no afecta el puntaje (requiere ≥5 tazas)" | V | Move to `messages/` via the `cupping` namespace. |
| components/cupping/CombinedForm.tsx:81, 185 | same two strings | V | Same as above. |
| components/cupping/DescriptiveForm.tsx:164 | "Sensación en Boca" (block title) | V | Move to `messages/`. |
| components/cupping/PhysicalEvalForm.tsx:88, 92, 95, 137, 184, 201 | "Evaluación física", "No aplica todavía — sección en desarrollo", "Con base en una muestra de 350g", "Tamaño (Zaranda)", "Defectos — Categoría 1", "Defectos — Categoría 2" | V | Move to `messages/`. |
| components/cupping/ExtrinsicForm.tsx:102-253 | ~20 labels and placeholders: "Extrínseco", "Fase POST-CATA · …", "País", "Región", "Fecha/Año de cosecha", "Número OIC", "Tamaño del lote", "Clasificación local/regional", "Descripción del proceso", "País...", "Información sobre el cultivo...", "Otra información relevante..." | V | Highest-volume case. Move all to `messages/` under `cupping.extrinsic`. The file has no `t()` at all. |
| components/cupping/FlavorPicker.tsx:23, 26, 33 | "Ningún descriptor seleccionado", "Atrás", "Cerrar" | V | Move to `messages/`. |
| components/cupping/EditSampleMetadataForm.tsx:67 | fallback "No se pudo guardar. Inténtalo de nuevo." | V | Use the `errors.codes` pattern or `t()`. |
| components/results/ExtrinsicSummary.tsx:18-82 | labels "País", "Región", "Fecha/Año de cosecha", "Descripción del proceso", "Clasificación local/regional", "Número OIC", "Tamaño del lote", "Otra información", "Sí", "Datos de la muestra (extrínseco)" | V | Move to `messages/`. The map has a Spanish-only label array. |
| components/results/SampleRadarChart.tsx:258, 384 | "Puntuación comunidad:", "El gráfico radar requiere datos afectivos (formato afectivo o combinado)" | V | Move to `messages/`. |
| components/results/FlavorCloud.tsx:56 | "Perfil de Sabor" | V | Move to `messages/`. |
| components/ui/ScoreDisplay.tsx:32, 47, 53, 61 | "Puntuación CVA", "Penalización uniformidad", "Penalización defectos", "Ocultar desglose" / "Ver desglose" | V | Move to `messages/`. Inline single-quoted literals at :61. |
| components/onboarding/WelcomeModal.tsx:19-40 | option labels and descriptions ("Aficionado/a al café de especialidad", "Crear mi primera sesión CVA", "Añadir un café a mi biblioteca", "Unirme a una sesión", …) | V | Move to `messages/` under `onboarding.*`. |
| components/onboarding/WelcomeModal.tsx:101, 107, 124, 133, 145, 168, 175, 190, 197, 207, 251 | "Bienvenido a Cata Café Sensible", "Evaluación descriptiva, afectiva y extrínseca…", "Omitir introducción", "Cuéntanos sobre ti", "Tu nombre", "País", "Selecciona tu país", "Atrás", "Siguiente", "¿Por dónde empezar?" | V | Move to `messages/`. The file has no `t()` at all. |
| components/layout/navItems.ts:18, 42 | comment only | C | Skip. |
| components/landing/mockframes/MockFrameFlavorPills.tsx:9, 13 | "Cítricos", "Té negro" | V (mock marketing frame) | Low priority. Route through the landing dictionary or use a neutral mock label. |
| components/dev/DevRoleBadge.tsx:4-6 | "DEV · Maestro", "DEV · Participante 1/2" | D | Acceptable. Dev-only. |
| components/ui/MasterControls.tsx:16, 38 | comments only | C | Skip. |

### 1d. App routes and pages

| file:line | literal | user-visible? | suggested fix |
|---|---|---|---|
| app/layout.tsx:48, 50 | metadata title "Café Sensible" and Spanish description | V (browser tab, search) | Use `generateMetadata` per locale. Note: the brand here is "Café Sensible", not "Cata Café". |
| app/manifest.ts:5, 6, 8 | `name`/`short_name` "Café Sensible", Spanish description | V (install prompt) | Localize, or set the manifest to a neutral name. |
| app/not-found.tsx:14 | "Página no encontrada" | V | Bilingual fallback by design (per CLAUDE.md). Low priority. (I) |
| app/global-error.tsx:14-18 | title / body / "Código de soporte" map | V | Intentional hardcoded es/en map (per CLAUDE.md exception). Keep, but note it duplicates `messages/`. (I) |
| app/[locale]/app/page.tsx:40 | `locale === "es" ? \`hace ${days} día…\` : …` | V | Inline locale ternary. Move to ICU plural in `messages/`. |
| app/[locale]/app/sessions/[id]/cup/CupClient.tsx:777-780 | "¿Salir de la cata?", "Parece que retrocediste…", "Parte de tu avance está guardado…" | V | Verify. The CLAUDE.md mentions `leaveGuard.bodyPending` in messages, so these may be fallbacks. If they are, remove the literal. |
| app/[locale]/app/sessions/[id]/cup/error.tsx:27, 31, 33 | "Necesitas conexión para cargar esta sesión por primera vez.", "Reintentamos automáticamente sin éxito…", "Código de soporte" | V | Not one of the two sanctioned `useTranslations` boundaries (per CLAUDE.md). Use `useTranslations("errors")` or pass copy via props. |
| app/[locale]/app/sessions/[id]/print/PrintClient.tsx:1194, 1290 | "El formato impreso usa hojas A4…", "No hay muestras en esta sesión." | V | Move to `messages/` and pass via the `translations` prop. |
| app/[locale]/dev/page.tsx:51, 58, 123, 130, 144-152 | dev guide text | D | Acceptable. Dev-only route. |
| app/[locale]/dev/DevQuickStart.tsx:46, 62, 74 | "Creando...", "SESIÓN CREADA", "PARTICIPANTES — abrir en ventanas incógnito" | D | Acceptable. Dev-only. |
| app/[locale]/app/profile/ProfileForm.tsx:128 | "Español" | V | Language self-name, which is a common convention. Keep. |
| app/actions/coffees.ts:28 | comment only | C | Skip. |

### 1e. Unaccented Spanish

The sweep found no additional unaccented Spanish outside the listed rows in `components/`, `lib/closeEmail.ts`, `lib/insightsDigestEmail.ts`, or `lib/pdf/`. Words such as "Guardar", "Cancelar", and "Confirmar" appear only in the string sets already covered above. A full unaccented sweep of `app/` is still owed.

## (2) Brand string inventory

Brand patterns: `Cata Café`, `Cata Cafe`, `catacafe`. Also noted: `Café Sensible` / `Cata Café Sensible`, which are product-name variants.

| file:line | context | user-visible? |
|---|---|---|
| app/actions/groups.ts:221, 230 | email subject (ES / EN) | V |
| app/actions/groups.ts:224, 233 | CTA "Unirme en Cata Café" / "Join on Cata Café" | V |
| app/actions/groups.ts:226, 235 | email footer ES / EN | V |
| app/actions/groups.ts:253, 640, 824 | HTML email header `<h2>Cata Café</h2>` | V |
| app/actions/groups.ts:612, 619 | `openAppLabel` "Abrir Cata Café" / "Open Cata Café" | V |
| app/actions/groups.ts:614, 621 | footer ES / EN | V |
| app/actions/groups.ts:802, 810 | invite body ES / EN | V |
| app/actions/groups.ts:804, 812 | footer ES / EN | V |
| app/[locale]/app/sessions/[id]/print/PrintClient.tsx:661 | print wordmark `Cata Café` | V |
| components/onboarding/WelcomeModal.tsx:101 | heading "Bienvenido a Cata Café Sensible" | V |
| components/insights/InsightCardComposer.tsx:331 | rendered brand on the exported card | V |
| components/insights/InsightCardComposer.tsx:333 | `catacafe.app` wordmark on the exported card | V |
| lib/ai/narratives.ts:18 | `BASE_SYSTEM` LLM prompt: "You are the data analyst of Cata Café…" | Not directly; the model may echo it |
| lib/closeEmail.ts:45, 62 | email header `<h2>Cata Café</h2>` | V |
| lib/email.ts:44 | `DEFAULT_FROM = "Cata Café <no-reply@catacafe.app>"` (sender display name and address domain) | V |
| lib/insightsDigestEmail.ts:46, 59 | email subject ES / EN | V |
| lib/insightsDigestEmail.ts:202 | email header `<h2>Cata Café</h2>` | V |
| lib/pdf/cvaFormData.ts:108, 184 | footer disclaimer "generado por Cata Café" (ES / EN) | V |
| lib/pdf/CvaFormDocument.tsx:586 | PDF brand text | V |
| lib/pdf/CvaFormDocument.tsx:1084, 1098, 1110, 1121 | `<Document author="Cata Café">` | V (PDF file properties) |
| lib/pdf/GroupSummaryDocument.tsx:204 | `<Document author="Cata Café">` | V (file properties) |
| lib/pdf/GroupSummaryDocument.tsx:236 | footer "Cata Café · {t.spec}" | V |
| lib/pdf/InsightsReportDocument.tsx:75, 105 | `wordmark: "Cata Café"` | V |
| app/layout.tsx:48, 50 | metadata uses "Café Sensible" (product name variant) | V |
| app/manifest.ts:5, 6 | "Café Sensible" (product name variant) | V |

Brand strings outside the audited scope, not counted here: `CLAUDE.md`, `README.md`, `DESIGN.md`, `PRODUCT.md`, `docs/`, `messages/*.json`, `design_handoff_cata_cafe_sensible/`, `.github/`.

## Summary

- Spanish literal rows in table 1: about 75 user-visible groups. Highest-volume files are `ExtrinsicForm.tsx`, `WelcomeModal.tsx`, `groups.ts` email templates, `lib/pdf/cvaFormData.ts`, and `PhysicalEvalForm.tsx`. `WelcomeModal.tsx` and `ExtrinsicForm.tsx` have no `t()` call at all.
- Brand occurrences in scope: 43 lines (the table rows above), 42 user-visible and 1 (`lib/ai/narratives.ts:18`) an LLM prompt.
- Not yet covered: a full unaccented sweep over `app/`, and per-line verification of data-key vs. label use in `CoffeesTable.tsx`.
