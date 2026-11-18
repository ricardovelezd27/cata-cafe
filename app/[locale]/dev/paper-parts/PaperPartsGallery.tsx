"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import { Notice } from "@/components/ui/Notice";
import { PaperSectionHeading } from "@/components/ui/PaperSectionHeading";
import { GroupEmailOptOutNotice } from "@/components/groups/GroupEmailOptOutNotice";

// Dev-only board for the paper primitives of package P2a (Card, Notice,
// PaperSectionHeading): every variant and state, and beside them the
// hand-written recipes they replace, copied from the app as they were on
// `main` at 83aab48. Its copy is the board's own (Spanish and English); the
// dismiss label comes from the messages. It reads nothing else.

export type PaperPartsStrings = { dismiss: string; close: string };

const COPY = {
  es: {
    boardTitle: "Piezas de papel",
    boardLead: "Card, Notice y el encabezado de sección de papel, con la receta escrita a mano que reemplazan.",
    before: "Antes: receta escrita a mano",
    after: "Después: la pieza",
    headings: "Encabezado de sección",
    headingsLead: "Nivel 2 para una sección, nivel 3 para un título dentro de una tarjeta.",
    sectionName: "Cafés",
    sectionTitle: "Lo que cataste este mes",
    sectionAssertion: "Seis cafés, tres orígenes, dos catas en grupo.",
    seeAll: "Ver todo",
    infoTitle: "Qué cuenta aquí",
    infoBody: "Solo las catas cerradas cuentan.",
    plainTitle: "Miembros",
    cards: "Tarjetas",
    cardsLead: "Un solo esqueleto: nombre pequeño, título, contenido y pie sobre una línea fina.",
    eyebrow: "Grupo",
    cardTitle: "Catadores de los jueves",
    cardBody: "Cinco miembros. Última cata el 12 de noviembre.",
    footer: "Creado el 3 de octubre",
    edit: "Editar",
    quiet: "Tono tranquilo",
    quietBody: "Para agrupar controles de una parte de un formulario.",
    selected: "Tono elegido",
    selectedBody: "Para la opción marcada de un conjunto.",
    compact: "Relleno compacto",
    compactBody: "16 px en todos los tamaños.",
    stat: "Puntaje medio",
    statValue: "84.25",
    linkCard: "Tarjeta que es un enlace",
    linkBody: "Toda la tarjeta lleva a su página; Tab la alcanza una sola vez.",
    buttonCard: "Tarjeta que es un botón",
    buttonBody: "Pulsada {n} veces.",
    nested: "Una tarjeta dentro de otra",
    nestedBody: "La de dentro se dibuja sin segundo marco: las tarjetas no se anidan.",
    inner: "Contenido interior",
    listCards: "Tarjetas de una lista (li)",
    notices: "Avisos",
    noticesLead: "Una frase que dice qué pasó. Información, advertencia o error; nunca terracota.",
    info: "Estás viendo la sesión como administrador.",
    warning: "Parte de tu avance está guardado solo en este dispositivo.",
    error: "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.",
    labelWarn: "Aviso:",
    retry: "Reintentar",
    dismissible: "Puedes cerrar este aviso cuando lo hayas leído.",
    dismissed: "Aviso cerrado.",
    show: "Mostrar de nuevo",
    staticNote: "Un aviso que forma parte de la página desde el principio (sin anunciarlo).",
    groupCard: "Tarjeta de grupo (lista de grupos)",
    coffeeCard: "Tarjeta del perfil de café (con sombra)",
    terracotta: "Aviso en terracota (resultados y cata)",
    optOut: "Aviso de baja de correos del grupo",
    optOutNote: "Dejaste de recibir los correos de este grupo.",
    optOutResume: "Volver a recibirlos",
    groupHeading: "Encabezado de la lista de grupos",
    coffeeHeading: "Etiqueta en mayúsculas usada como encabezado (perfil de café)",
    members: "5 miembros · 3 oct 2026",
  },
  en: {
    boardTitle: "Paper parts",
    boardLead: "Card, Notice and the paper section heading, with the hand-written recipe each replaces.",
    before: "Before: hand-written recipe",
    after: "After: the part",
    headings: "Section heading",
    headingsLead: "Level 2 for a section, level 3 for a title inside a card.",
    sectionName: "Coffees",
    sectionTitle: "What you cupped this month",
    sectionAssertion: "Six coffees, three origins, two group cuppings.",
    seeAll: "See all",
    infoTitle: "What counts here",
    infoBody: "Only closed cuppings count.",
    plainTitle: "Members",
    cards: "Cards",
    cardsLead: "One anatomy: small name, title, content and a footer on a hairline.",
    eyebrow: "Group",
    cardTitle: "Thursday cuppers",
    cardBody: "Five members. Last cupping on 12 November.",
    footer: "Created on 3 October",
    edit: "Edit",
    quiet: "Quiet tone",
    quietBody: "To group the controls of one part of a form.",
    selected: "Selected tone",
    selectedBody: "For the chosen option of a set.",
    compact: "Compact padding",
    compactBody: "16 px at every size.",
    stat: "Average score",
    statValue: "84.25",
    linkCard: "A card that is a link",
    linkBody: "The whole card goes to its page; Tab reaches it once.",
    buttonCard: "A card that is a button",
    buttonBody: "Pressed {n} times.",
    nested: "A card inside a card",
    nestedBody: "The inner one is drawn without a second frame: cards do not nest.",
    inner: "Inner content",
    listCards: "Cards of a list (li)",
    notices: "Notices",
    noticesLead: "One sentence that says what happened. Information, warning or error; never terracotta.",
    info: "You are viewing the session as an administrator.",
    warning: "Part of your progress is saved on this device only.",
    error: "It could not be saved. Check your connection and try again.",
    labelWarn: "Note:",
    retry: "Retry",
    dismissible: "You can dismiss this notice once you have read it.",
    dismissed: "Notice dismissed.",
    show: "Show it again",
    staticNote: "A notice that is part of the page from the start (not announced).",
    groupCard: "Group card (groups list)",
    coffeeCard: "Coffee profile card (with a shadow)",
    terracotta: "Terracotta notice (results and cupping)",
    optOut: "Group email opt-out notice",
    optOutNote: "You stopped receiving this group's emails.",
    optOutResume: "Receive them again",
    groupHeading: "Groups list heading",
    coffeeHeading: "Uppercase label used as a heading (coffee profile)",
    members: "5 members · 3 Oct 2026",
  },
} as const;

function Pair({ title, before, after, labels }: { title: string; before: React.ReactNode; after: React.ReactNode; labels: { before: string; after: string } }) {
  return (
    <div className="mb-[24px]">
      <p className="mb-2 text-caption font-semibold text-on-surface">{title}</p>
      <div className="grid gap-[16px] md:grid-cols-2">
        <div>
          <p className="mb-2 text-label font-semibold uppercase tracking-widest text-on-surface-variant">{labels.before}</p>
          {before}
        </div>
        <div>
          <p className="mb-2 text-label font-semibold uppercase tracking-widest text-on-surface-variant">{labels.after}</p>
          {after}
        </div>
      </div>
    </div>
  );
}

export function PaperPartsGallery({ locale, strings }: { locale: string; strings: PaperPartsStrings }) {
  const c = COPY[locale === "en" ? "en" : "es"];
  const [presses, setPresses] = useState(0);
  const [shown, setShown] = useState(true);
  const labels = { before: c.before, after: c.after };

  return (
    <div className="mx-auto max-w-[1200px] px-[16px] py-[24px] md:px-[24px] md:py-[32px]">
      <h1 className="page-title mb-1">{c.boardTitle}</h1>
      <p className="mb-[32px] text-body text-on-surface-variant">{c.boardLead}</p>

      {/* ── Section headings ───────────────────────────────────── */}
      <section className="mb-[40px]" aria-labelledby="pp-headings">
        <PaperSectionHeading id="pp-headings" title={c.headings} assertion={c.headingsLead} />
        <div className="space-y-[24px] rounded-card border border-dashed border-outline-variant p-[16px]">
          <PaperSectionHeading
            name={c.sectionName}
            title={c.sectionTitle}
            assertion={c.sectionAssertion}
            info={<InfoHint title={c.infoTitle} body={c.infoBody} closeLabel={strings.close} />}
            action={<Button variant="secondary" size="sm">{c.seeAll}</Button>}
          />
          <PaperSectionHeading title={c.plainTitle} />
          <Card>
            <PaperSectionHeading level={3} name={c.eyebrow} title={c.cardTitle} assertion={c.cardBody} flush />
          </Card>
        </div>
        <div className="mt-[24px]">
          <Pair
            title={c.groupHeading}
            labels={labels}
            before={<h2 className="section-title text-xl">{c.plainTitle}</h2>}
            after={<PaperSectionHeading title={c.plainTitle} flush />}
          />
          <Pair
            title={c.coffeeHeading}
            labels={labels}
            before={
              <div>
                <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{c.sectionName}</h3>
                <h3 className="mb-2 text-lg">{c.sectionTitle}</h3>
              </div>
            }
            after={<PaperSectionHeading name={c.sectionName} title={c.sectionTitle} flush />}
          />
        </div>
      </section>

      {/* ── Cards ──────────────────────────────────────────────── */}
      <section className="mb-[40px]" aria-labelledby="pp-cards">
        <PaperSectionHeading id="pp-cards" title={c.cards} assertion={c.cardsLead} />
        <div className="grid gap-[12px] md:grid-cols-2 md:gap-[16px] lg:grid-cols-3">
          <Card eyebrow={c.eyebrow} title={c.cardTitle} action={<Button variant="ghost" size="sm">{c.edit}</Button>} footer={<span className="text-caption text-on-surface-variant">{c.footer}</span>}>
            <p className="text-body">{c.cardBody}</p>
          </Card>
          <Card tone="quiet" title={c.quiet}>
            <p className="text-body">{c.quietBody}</p>
          </Card>
          <Card tone="selected" title={c.selected}>
            <p className="text-body">{c.selectedBody}</p>
          </Card>
          <Card padding="compact" title={c.compact}>
            <p className="text-body">{c.compactBody}</p>
          </Card>
          <Card href={`/${locale}/dev/paper-parts#pp-cards`} title={c.linkCard}>
            <p className="text-body">{c.linkBody}</p>
          </Card>
          <Card onClick={() => setPresses((n) => n + 1)} title={c.buttonCard}>
            <p className="text-body">{c.buttonBody.replace("{n}", String(presses))}</p>
          </Card>
          <Card title={c.nested}>
            <p className="mb-2 text-body">{c.nestedBody}</p>
            <Card title={c.inner}>
              <p className="text-caption text-on-surface-variant">{c.inner}</p>
            </Card>
          </Card>
        </div>
        <div className="mt-[16px] grid grid-cols-[repeat(auto-fill,minmax(160px,240px))] gap-[12px] md:gap-[16px]">
          <Card stat eyebrow={c.stat}>
            <p className="font-serif text-section tabular-nums">{c.statValue}</p>
          </Card>
          <Card stat eyebrow={c.stat} tone="quiet">
            <p className="font-serif text-section tabular-nums">{c.statValue}</p>
          </Card>
        </div>
        <p className="mb-2 mt-[16px] text-caption font-semibold text-on-surface">{c.listCards}</p>
        <ul className="grid gap-[12px] md:grid-cols-2 md:gap-[16px]">
          <Card as="li" href={`/${locale}/dev/paper-parts#pp-cards`} title={c.cardTitle}>
            <p className="text-caption text-on-surface-variant">{c.members}</p>
          </Card>
          <Card as="li" title={c.cardTitle}>
            <p className="text-caption text-on-surface-variant">{c.members}</p>
          </Card>
        </ul>
        <div className="mt-[24px]">
          <Pair
            title={c.groupCard}
            labels={labels}
            before={
              <Link
                href={`/${locale}/dev/paper-parts#pp-cards`}
                className="block bg-surface-container-lowest rounded-card border border-outline-variant p-5 transition-all hover:shadow-md hover:border-primary-muted"
              >
                <p className="font-semibold text-[15px] text-on-surface truncate">{c.cardTitle}</p>
                <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{c.cardBody}</p>
                <p className="text-xs text-on-surface-variant mt-2">{c.members}</p>
              </Link>
            }
            after={
              <Card href={`/${locale}/dev/paper-parts#pp-cards`} title={c.cardTitle}>
                <p className="line-clamp-2 text-body text-on-surface-variant">{c.cardBody}</p>
                <p className="mt-2 text-caption text-on-surface-variant">{c.members}</p>
              </Card>
            }
          />
          <Pair
            title={c.coffeeCard}
            labels={labels}
            before={
              <div className="rounded-card border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
                <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{c.stat}</h3>
                <p className="font-serif text-3xl">{c.statValue}</p>
              </div>
            }
            after={
              <Card stat eyebrow={c.stat}>
                <p className="font-serif text-section tabular-nums">{c.statValue}</p>
              </Card>
            }
          />
        </div>
      </section>

      {/* ── Notices ────────────────────────────────────────────── */}
      <section className="mb-[40px]" aria-labelledby="pp-notices">
        <PaperSectionHeading id="pp-notices" title={c.notices} assertion={c.noticesLead} />
        <div className="space-y-[12px]">
          <Notice tone="info">{c.info}</Notice>
          <Notice tone="warning" label={c.labelWarn}>{c.warning}</Notice>
          <Notice tone="error" action={<Button variant="secondary" size="sm">{c.retry}</Button>}>{c.error}</Notice>
          {shown ? (
            <Notice tone="info" onDismiss={() => setShown(false)} dismissLabel={strings.dismiss}>
              {c.dismissible}
            </Notice>
          ) : (
            <p className="text-caption text-on-surface-variant">
              {c.dismissed}{" "}
              <button type="button" className="min-h-[44px] underline underline-offset-2" onClick={() => setShown(true)}>
                {c.show}
              </button>
            </p>
          )}
          <Notice tone="info" live={false}>{c.staticNote}</Notice>
        </div>
        <div className="mt-[24px]">
          <Pair
            title={c.terracotta}
            labels={labels}
            before={
              <div role="status" className="rounded-card border border-secondary/30 bg-secondary-container/20 px-4 py-2 font-sans text-sm text-on-surface">
                {c.info}
              </div>
            }
            after={<Notice tone="info">{c.info}</Notice>}
          />
          <Pair
            title={c.optOut}
            labels={labels}
            before={
              <div className="flex flex-wrap items-center gap-3 rounded-card border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm text-on-surface-variant">
                <p className="min-w-0 flex-1">{c.optOutNote}</p>
                <button
                  type="button"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border border-outline-variant px-4 py-2 text-sm font-medium text-primary-container transition-colors hover:bg-surface-container-high"
                >
                  {c.optOutResume}
                </button>
              </div>
            }
            after={<GroupEmailOptOutNotice groupId="dev-board" t={{ note: c.optOutNote, resume: c.optOutResume }} />}
          />
        </div>
      </section>
    </div>
  );
}
