"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Check, ChevronRight, Eye } from "lucide-react";
import { ScoreWithContext } from "@/components/ui/ScoreWithContext";
import { PHONE_MAX, carouselIndex } from "@/components/landing/carouselIndex";
import { fillPattern } from "@/lib/fillPattern";
import type { WheelFamilyId } from "@/lib/flavorWheel";
import type { SessionFormat } from "@/lib/constants";
import type { CardSample, CoffeeCard, QualityRow } from "@/lib/reports/coffeeCards";
import { referenceBadgeText } from "@/lib/referenceRules";
import type { CardsStrings } from "./cardsStrings";
import { CountedList } from "./CountedList";
import { FlavorWheel } from "./FlavorWheel";
import type { ResultsPartsStrings } from "./partsStrings";
import styles from "./CoffeeCards.module.css";

/** What a card reads of a sample. The results route's `SampleResult` satisfies it. */
export type CardSampleProps = CardSample & {
  revealed: boolean;
  coffee: { name: string; country?: string | null } | null;
};

function subscribePhone(cb: () => void) {
  const query = window.matchMedia(PHONE_MAX);
  query.addEventListener("change", cb);
  return () => query.removeEventListener("change", cb);
}
const isPhone = () => window.matchMedia(PHONE_MAX).matches;
const notPhone = () => false;

/** One card's width plus the gap of the row. */
function stepOf(list: HTMLElement): number {
  const first = list.firstElementChild as HTMLElement | null;
  if (!first) return 0;
  return first.offsetWidth + (parseFloat(getComputedStyle(list).columnGap) || 0);
}

/** Which card of the sideways row is the one being read (the landing's own rule). */
function useRowIndex(listId: string, total: number): number {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const list = document.getElementById(listId);
    if (!list) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const atEnd = list.scrollLeft >= list.scrollWidth - list.clientWidth - 1;
      setIndex(carouselIndex(list.scrollLeft, stepOf(list), total, atEnd));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    schedule();
    list.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      list.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [listId, total]);
  return Math.min(index, Math.max(0, total - 1));
}

/** The eight quality attributes of an affective session, as a small two-column
 *  list: the group's average where this reader may see it, else their own value. */
function QualityLine({ rows, t }: { rows: QualityRow[]; t: CardsStrings }) {
  const group = rows.some((row) => row.group !== null);
  const value = (row: QualityRow) => (group ? row.group : row.mine);
  if (!rows.some((row) => value(row) !== null)) return null;
  const text = (v: number | null) => (v === null ? "–" : Number.isInteger(v) && !group ? String(v) : v.toFixed(1));
  return (
    <div className={styles.quality}>
      <p className={styles.caption}>{group ? t.qualityGroup : t.qualityMine}</p>
      <dl className={styles.qualityList}>
        {rows.map((row) => (
          <div key={row.id} className={styles.qualityRow}>
            <dt>{t.attributes[row.id] ?? row.id}</dt>
            <dd>{text(value(row))}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * One card per coffee, in the order of the ranking, the references first and
 * marked "fuera del ranking". On a phone the cards are a sideways row (the next
 * one shows at the edge, numbered steps under it); from 768 px, a grid.
 *
 * It draws; it does not decide. WHAT a card shows for this viewer and this
 * state is `coffeeCards` (lib/reports/coffeeCards.ts), from data the server
 * already gated. A score is a number in ink; a family's colour paints the
 * wheel only. A card opens its coffee (today's drill-down, until the sheet of
 * package R3).
 */
export function CoffeeCards<S extends CardSampleProps>({
  cards,
  format,
  referencePinned,
  canReveal,
  onReveal,
  onOpenSample,
  familyLabels,
  nodeLabels,
  parts,
  t,
}: {
  /** `coffeeCards(...)`: the page builds them once, for the row and for the drill-down. */
  cards: CoffeeCard<S>[];
  format: SessionFormat;
  /** The reference's quality is fixed for everyone: its card shows no quality line. */
  referencePinned: boolean;
  /** The organizer of a cupping that is still open: "Revelar" on a card, as before. */
  canReveal: boolean;
  onReveal: (sampleId: string) => void;
  onOpenSample: (sampleId: string) => void;
  familyLabels: Record<WheelFamilyId, string>;
  /** Every wheel node's name in the reader's language. */
  nodeLabels: Readonly<Record<string, string>>;
  parts: ResultsPartsStrings;
  t: CardsStrings;
}) {
  const titleId = useId();
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const phone = useSyncExternalStore(subscribePhone, isPhone, notPhone);
  const current = useRowIndex(listId, cards.length);
  const referenceCount = cards.filter((card) => card.isReference).length;
  if (cards.length === 0) return null;

  const nameOf = (s: S) => (s.revealed && s.coffee ? s.coffee.name : null);

  /** Bring a card to the start of the row and, from the keyboard, focus it. */
  const goTo = (index: number, focus: boolean) => {
    const list = listRef.current;
    const card = list?.children[index] as HTMLElement | undefined;
    if (!list || !card) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // the row is the cards' offset parent: a card starts where the row's padding ends
    const pad = parseFloat(getComputedStyle(list).paddingLeft) || 0;
    list.scrollTo({ left: card.offsetLeft - pad, behavior: reduced ? "auto" : "smooth" });
    if (focus) card.querySelector<HTMLElement>("[data-card-open]")?.focus({ preventScroll: true });
  };
  /** Arrow keys walk the row while it is a sideways scroller: one Tab stop for all of it. */
  const onRowKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!phone) return;
    const at = (event.target as HTMLElement).closest("[data-card]");
    const from = at ? Array.prototype.indexOf.call(event.currentTarget.children, at) : current;
    const to =
      event.key === "ArrowRight"
        ? from + 1
        : event.key === "ArrowLeft"
          ? from - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? cards.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    goTo(Math.min(cards.length - 1, Math.max(0, to)), true);
  };
  const onStepsKey = (event: KeyboardEvent<HTMLElement>) => {
    const to = event.key === "ArrowRight" ? current + 1 : event.key === "ArrowLeft" ? current - 1 : null;
    if (to === null || to < 0 || to >= cards.length) return;
    event.preventDefault();
    goTo(to, false);
    (event.currentTarget.children[to] as HTMLElement | undefined)?.focus({ preventScroll: true });
  };
  // while the row is a scroller only the card being read takes the Tab key
  const tabIndexOf = (index: number) => (phone && index !== current ? -1 : 0);

  const renderCard = (card: CoffeeCard<S>, index: number) => {
    const { sample } = card;
    const name = nameOf(sample);
    const stateChip = card.state === "draft" ? t.inProgress : card.state === "none" ? t.notEvaluated : null;
    return (
      <li key={sample.id} className={styles.card} data-card="" data-reference={card.isReference ? "" : undefined}>
        {/* the whole card opens its coffee: first in the card, so it is laid under the organizer's button */}
        <button
          type="button"
          className={styles.cover}
          data-card-open=""
          tabIndex={tabIndexOf(index)}
          aria-label={fillPattern(t.viewDetailOf, { label: name ? `${sample.label} ${name}` : sample.label })}
          onClick={() => onOpenSample(sample.id)}
        />
        {/* the top takes the spare height, so the drawings of a row of cards line up */}
        <div className={styles.top}>
          <div className={styles.head}>
            {card.place !== null ? (
              <span className={styles.place}>{card.place}</span>
            ) : null}
            <div className={styles.names}>
              <h3 className={styles.cardTitle}>
                {sample.label}
                {name ? (
                  <span className={styles.coffee}>
                    {" "}
                    {name}
                    {/* its country, as the radar card's header had it */}
                    {sample.coffee?.country ? ` · ${sample.coffee.country}` : null}
                  </span>
                ) : null}
              </h3>
              {card.isReference || stateChip ? (
                <p className={styles.chips}>
                  {card.isReference ? (
                    <>
                      <span className={styles.chip}>
                        {referenceBadgeText(t.referenceBadge, sample.referenceRank, referenceCount)}
                      </span>
                      <span className={styles.aside}>{t.outsideRanking}</span>
                    </>
                  ) : null}
                  {stateChip ? <span className={styles.chip}>{stateChip}</span> : null}
                </p>
              ) : null}
            </div>
          </div>

          {card.context ? (
            <ScoreWithContext
              context={
                // a fixed reference's number is a rule, not an average: the number alone
                card.isReference && referencePinned
                  ? {
                      ...card.context,
                      spread: null,
                      included: null,
                      mine: null,
                      difference: null,
                      indicative: false,
                      suppressed: false,
                    }
                  : card.context
              }
              strings={parts.score}
              size="md"
            />
          ) : null}
          {card.partial ? <p className={styles.caption}>{t.partialLabel}</p> : null}
        </div>

        {card.wheel?.status === "ok" ? (
          <div className={styles.flavour}>
            <FlavorWheel
              counts={card.wheel.counts}
              n={card.wheel.n}
              familyLabels={familyLabels}
              strings={parts.wheel}
              size="medium"
              decorative
            />
            {card.wheel.scope === "group" ? (
              <div className={styles.found}>
                <p className={styles.caption}>{t.mostChosen}</p>
                <CountedList
                  items={card.wheel.descriptors}
                  labels={nodeLabels}
                  strings={parts.counted}
                  marked={card.wheel.mine}
                  ariaLabel={`${t.mostChosen}: ${sample.label}`}
                />
              </div>
            ) : (
              // the reader's own marks: the names, with no "1 de 1"
              <div className={styles.found}>
                <p className={styles.caption}>{t.youMarked}</p>
                <p className={styles.marks}>
                  {card.wheel.descriptors.map((d) => nodeLabels[d.id] ?? d.id).join(", ")}
                  {card.wheel.mine.length > card.wheel.descriptors.length
                    ? ` +${card.wheel.mine.length - card.wheel.descriptors.length}`
                    : null}
                </p>
              </div>
            )}
          </div>
        ) : card.wheel?.status === "too_few" ? (
          <p className={styles.caption}>{t.tooFew}</p>
        ) : null}

        {/* an affective session has no wheel: the eight quality attributes instead */}
        {format === "affective" && card.quality && !(card.isReference && referencePinned) ? (
          <QualityLine rows={card.quality} t={t} />
        ) : null}

        <div className={styles.foot}>
          <span className={styles.open} aria-hidden="true">
            {t.viewDetail}
            <ChevronRight size={14} />
          </span>
          {canReveal ? (
            sample.revealed ? (
              <span className={styles.revealed}>
                <Check size={14} aria-hidden="true" />
                {t.revealed}
              </span>
            ) : (
              <button
                type="button"
                className={styles.reveal}
                tabIndex={tabIndexOf(index)}
                onClick={() => onReveal(sample.id)}
                aria-label={`${t.reveal}: ${sample.label}`}
              >
                <Eye size={14} aria-hidden="true" />
                {t.reveal}
              </button>
            )
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <section className={styles.section} aria-labelledby={titleId} data-coffee-cards="">
      <div className={styles.intro}>
        <h2 id={titleId} className={`section-title ${styles.title}`}>
          {t.title}
        </h2>
        <p className={styles.note}>
          {format === "descriptive" ? t.noteDescriptive : format === "affective" ? t.noteAffective : t.note}
        </p>
      </div>
      {/* the list only relays the arrow keys of the cards inside it */}
      <ul ref={listRef} id={listId} className={styles.row} aria-label={t.rowLabel} onKeyDown={onRowKey}>
        {cards.map(renderCard)}
      </ul>
      {/* what "En curso" means, said once, only where a card carries it */}
      {cards.some((card) => card.state === "draft") ? <p className={styles.note}>{t.inProgressLegend}</p> : null}
      {cards.length > 1 ? (
        <nav className={styles.steps} aria-label={t.stepsLabel} onKeyDown={onStepsKey}>
          {cards.map((card, index) => (
            <button
              key={card.sample.id}
              type="button"
              className={styles.step}
              aria-current={index === current ? "true" : undefined}
              aria-controls={listId}
              aria-label={fillPattern(t.step, { n: index + 1, total: cards.length, label: card.sample.label })}
              tabIndex={index === current ? 0 : -1}
              onClick={() => goTo(index, false)}
            >
              <span className="step-mark" data-on={index === current ? "1" : undefined}>
                {index + 1}
              </span>
            </button>
          ))}
        </nav>
      ) : null}
    </section>
  );
}
