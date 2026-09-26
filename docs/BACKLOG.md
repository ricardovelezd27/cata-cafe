# Backlog consolidado — Café Sensible (2026-09-25)

> Una sola lista de todo lo planificado y **no implementado**, reunida de las últimas cuatro sesiones
> (landing cafesensible.ai · reunión Kim 2026-09-07 · muestra de referencia + referencia primero ·
> Verde/Vegetal · reunión Kim 2026-09-25), de `docs/prompts/S2–S5`, `docs/HANDOVER.md`, `PRODUCT.md`
> y la memoria de proyecto. Si un ítem no está aquí, o ya está en `main` o se descartó explícitamente.
> Actualizar este archivo en el mismo PR que cierra un ítem.

## 0. Ya en `main` (para no volver a planificarlo)

| Qué | Merge |
|---|---|
| Lanzamiento (seguridad S1–S5, máquina de estados de sesión, borrar-conserva-historial, `ActionResult`/toast, validación, observabilidad, env, cabeceras, PWA) | 172aa0b..a6a0056 (2026-09-14) |
| Reunión Kim 09-07: captura de email (claim), Usuarios para AI-admins + paginación, códigos de café, solo nombre obligatorio, edición de origen post-cierre, DE (±), PDF físico + tueste, ley «valor antes que fricción» | 1dfa0be |
| Landing cafesensible.ai: rebrand, escenario oscuro, constelación de partículas, tarjeta fundadores en el hero | f8331bd (PR #18) |
| Muestra de referencia: modelo, asistente/edición/panel maestro, Δ en resultados, PDF/print | 53f2a94 (PR #19) |
| Referencia primero + calidad fijada en 5 (79.00) + tarjeta ancla | 3a23acb (PR #20) |
| Verde/Vegetal: un solo L2 + Leguminoso/Crudo/Aceite de oliva | 0e70fbb |
| Fecha de cierre = fin del día + pista; hoja descriptiva sin texto libre; un icono de ayuda en Resumen; `scripts/export-emails.ts` | 0fb693c (PR #21) |

---

## 1. Operaciones pendientes (sin código; las hace Ricardo)

| # | Ítem | Origen | Estado / cómo |
|---|---|---|---|
| O1 | **Smoke test §5 del runbook en producción** (flujo grupal completo con login real) | HANDOVER, launch | STILL OWED desde 2026-09-14. Mini versión para la cata: `docs/product/experimento-referencia-2026-09.md` §1b |
| O2 | **Dominio cafesensible.ai**: añadir en Vercel, `NEXT_PUBLIC_SITE_URL`, **redeploy** (variable inlined), allow-list `/auth/callback` en Supabase, probar magic link + QR impreso | runbook §3/§6, memoria launch | Pendiente; el interim `cata-cafe-opal.vercel.app` sigue funcionando después |
| O3 | Kim en `ANALYTICS_AI_ADMIN_EMAILS` de producción | plan Kim 09-07 | Verificar en Vercel |
| O4 | **Fotos originales de la landing** (≥ 2000 px): `public/landing/real/01–05` siguen siendo miniaturas de WhatsApp (35–60 KB); la foto 05 a sangre se ve blanda en escritorio | plan landing | Swap de archivos, sin código. Pedir a Kim |
| O5 | **Iconos PWA reales** (`public/icons/*` son placeholders generados) | CLAUDE.md, evento Chile | Diseño; swap de archivos |
| O6 | Dominio verificado en Resend para `EMAIL_FROM` (hoy `no-reply@catacafe.app`) | plan landing (out of scope) | Bloquea T15 |
| O7 | Enviar a Kim el CSV de correos (generado 2026-09-25, 134 cuentas) | reunión 09-25 | Ricardo lo envía; PII, no se commitea |
| O8 | Base de datos dev ≠ prod (hoy `.env.local` apunta a producción) | Ricardo, plan Kim 09-07 | Se resuelve con S2 (T20) |

---

## 2. Producto — pedidos de Kim y decisiones de producto

Tamaño: S (≤ ½ día) · M (1–2 días) · L (≥ 3 días o requiere spec). ⚑ = necesita decisión antes de codificar.

| # | Ítem | Origen | Tamaño | Prompt / notas |
|---|---|---|---|---|
| T1 | **Nube de descriptores**: una palabra por descriptor, tamaño = suma de menciones por etapa, desglose al pasar el ratón / tocar, tope ~30, fusionar «Floral»/«Floral» | Kim 09-25; decisión Ricardo | M | `S5` ítem 1 — **primero el lunes 28** |
| T2 | **Descriptor propio archivado bajo grupo/subgrupo** («romero» → Verde/Vegetal › Herbáceo); fase B aviso antes de enviar; fase C ⚑ barrido IA al cerrar | Kim 09-25 | M (+M) | `S5` ítem 2 |
| T3 | **Ritual vs Calibración** como primera decisión del asistente + checklist de materiales por modo | Kim 09-25 ⚑ | L | `S5` ítem 3; texto de Kim. Cubre también «guía para montar la mesa» (plan Kim 09-07, ideas C) |
| T4 | **Tres objetivos de cata** (criterio del maestro / criterio libre / objetivo de compra con perfil descriptivo objetivo) | Kim 09-25 ⚑; PRODUCT.md «structured objectives» | L (spec primero) | `S5` ítem 4 → `docs/product/objetivos-de-cata.md`. La hoja `objetivos-y-metodologias.md` tiene 5 «Pendiente» que rellena Kim |
| T5 | **Ejercicios previos a la cata** (texto de Kim, 3 fases, flechas; vídeos como enlaces privados de YouTube; caricatura después) | Kim 09-25; plan Kim 09-07 (AI trainer) | M | `S5` ítem 5 |
| T6 | Realtime para muestras añadidas/renombradas (hoy hay que recargar) | Kim 09-25 | S–M | `S5` ítem 6 |
| T7 | Landing: sección de casos de uso (ritual / calibración / compra) | Kim 09-25 (diferido por ambos) | S | `S5` ítem 7; depende de T3 para el lenguaje |
| T8 | **Re-fijar en 5 las evaluaciones ya guardadas** cuando el maestro cambia la referencia a mitad de cata | hallazgo 09-25 | S | `S5` ítem 8 |
| T9 | Fecha de cierre **editable** en la página de edición (+ `isAsync` en consecuencia) | Kim 09-25 («cambiar la fecha después») | S | `S5` ítem 9 |
| T10 | Botón **Exportar CSV** en Usuarios (para no depender del script) | Kim 09-25 | S | `S5` ítem 10 |
| T11 | **Radar de tres polígonos** (yo / referencia / grupo) + Δ por atributo | plan referencia | M | `S3` — **solo si** la cata del 26 valida la referencia (§7 del experimento) ⚑ |
| T12 | ⚑ **Pedir email antes de unirse** vs aviso post-sesión (A/B por evento) | Kim 09-07, decisión aplazada por Kim | S una vez decidido | Hoy: claim post-resultados |
| T13 | Conversión de invitados: CTA post-envío en `/cup`, botón reenviar verificación, onboarding (rol/país) para invitados convertidos | plan Kim 09-07 (diferido de S1) | S cada uno | — |
| T14 | Usuarios: filtro por fecha + gráfico de altas (pregunta de Kim «¿cuántos se registraron tras Chile?») | plan Kim 09-07 (diferido) | S | Hoy: columna «Se unió» ordenable + faceta |
| T15 | **Strings «Cata Café» dentro de la app → cafesensible** (46 apariciones en 10 archivos: WelcomeModal, PDF, PrintClient, `lib/email.ts`, closeEmail, insightsDigestEmail, narratives, groups) | plan landing (out of scope) | S | El remitente de email necesita O6 primero |
| T16 | Metadatos del café revelado (país/variedad/proceso/altitud) en el anexo del PDF | plan Kim 09-07 (diferido) | S | — |
| T17 | DE (±) también en la celda de `ScoreTable` | plan Kim 09-07 (diferido) | S | Hoy solo en ranking Resumen + matriz del maestro |
| T18 | Prompt de sistema de la IA editable por el super-admin | plan Kim 09-07 (diferido) | S | — |
| T19 | ⚑ Modelo de precios / límites del plan gratuito | Kim 09-07 (futuro) | — | Discusión, no código |

Ideas aparcadas explícitamente (no planificar hasta que alguien las pida): IA como entrenador
(detectar áreas débiles, enlazar a páginas del libro), formularios modulares (espresso sin
fragancia/aroma), apps nativas / App Store, plantillas de sesión, referencia por atributo, histórico
de evolución del catador, herramientas profesional-vs-consumidor. **Descartado por Kim:** otros
métodos de cata (SCA 2004, COE) — 100 % CVA.

---

## 3. Ingeniería, entornos e higiene

| # | Ítem | Origen | Tamaño | Prompt / notas |
|---|---|---|---|---|
| T20 | **Staging vs producción**: `lib/appEnv.ts`, banner, robots noindex, crons inertes, guardas `db:migrate:prod` + `CONFIRM_PROD`, `scripts/verify-env.ts`, CI en GitHub Actions, `bootstrap_fresh_project.sql`, `docs/ENVIRONMENTS.md`, cutover de dominio | plan referencia | L | `S2` — resuelve O2 y O8. Requiere 2.º proyecto Supabase y variables en Vercel (Ricardo) |
| T21 | **Higiene de resultados**: `ScorePill` usa `scoreBand()`, `FormatBadge` con tokens + i18n, un solo tipo `SampleResult`, strings fijos del radar → i18n, **lint a cero** (IntensitySlider refs-in-render, dev page), README | plan referencia | M | `S4` — 6 commits; el lint a cero habilita CI bloqueante en S2 |
| T22 | `updateSession` sin `assertSessionWritable` (nombre/fecha/objetivo editables en sesión cerrada) | hallazgo 09-25 | XS | Junto con S4 |
| T23 | Aviso de hidratación del reloj de `/cup` (`clockTime` en `useState`) | plan referencia | XS | Junto con S4 |
| T24 | `Coffee.code` NOT NULL (backfill ya hecho en la BD compartida) | plan Kim 09-07 (diferido) | XS | Migración + `prisma migrate resolve` (drift del shadow DB sin baseline) |
| T25 | Post-lanzamiento (WP6): `joinViaToken` transaccional en Prisma, `addSessionSample` posición por `max()+1`, `mergeGuestData` con `timeout`, **borrado de cuenta**, aviso en `deleteCoffee` con nº de usuarios afectados, `DigestRun` atómico antes de enviar el digest, `search_path` en funciones security-definer | plan lanzamiento | S cada uno (L el borrado de cuenta) | No programado |
| T26 | Estrechar el alcance de analytics (`AnalyticsScope`) | plan lanzamiento WP6 | S | — |
| T27 | CAPTCHA (Turnstile) en anonymous sign-ins — **declinado** para el evento; revisar solo si crece el abuso / bloat de `profiles` | evento Chile | S | Vigilar, no hacer |
| T28 | Memoria + docs: cuando S4 deje el lint a cero, borrar «baseline 4 errores / 7 avisos» de CLAUDE.md, S2, S4 y memorias | plan referencia | XS | — |

---

## 4. Roadmap de `PRODUCT.md` no cubierto arriba

| Ítem | Estado |
|---|---|
| Comparación de un café entre varias sesiones | No empezado |
| Exportar a CSV (resultados) | No empezado (T10 es solo emails) |
| Aleatorizar el orden de muestras por participante | No empezado — **ojo:** choca con «la referencia va primero»; decidir si se aleatoriza solo el resto |
| Plantillas de sesión (conjuntos de muestras preconfigurados) | Aparcado hasta la evidencia de la referencia |
| Cuentas de organización / roles (admin · catador · observador) / resultados públicos por URL | «Later», sin fecha |
| ~~QR para el enlace de invitación~~ | **Ya hecho** (asistente paso 2, print) — corregido en PRODUCT.md |

---

## 5. Decisiones que bloquean trabajo (para la reunión del lunes 28)

1. **Kim:** ¿pedir email antes de unirse o mantener el claim post-resultados? (T12)
2. **Kim + Ricardo:** ¿valida la cata del 26 el concepto de referencia? → T11 sí/no; rellenar §7 del experimento.
3. **Kim + Ricardo:** definición de Ritual vs Calibración (T3) y de los tres objetivos (T4) — texto de Kim para checklists y ejercicios (T3, T5).
4. **Ricardo:** ¿segundo proyecto Supabase para staging ahora (T20) o después de S4/S5?
5. **Kim:** fotos originales (O4) y ¿logo? (la landing usa wordmark de texto).

## 6. Orden propuesto

1. Lunes 28 → **T1** (nube), **T8** (re-fijar), **T9** (fecha editable), **T22** (guarda) — todos S, un PR.
2. Semana del 28 → **T2** fase A, **T10**, **T15** (menos email), **T21** (S4).
3. Después del evento del libro (1–2 oct) → **T20** (S2, staging + dominio), **O2**, **O6** + T15 email.
4. Con las decisiones de Kim → **T3**, **T4**, **T5**, **T7**; **T11** solo si procede.
5. Cuando haya tiempo → T13, T14, T16–T18, T24–T26.
