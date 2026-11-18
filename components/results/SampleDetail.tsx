"use client";

/**
 * The body of a coffee's SHEET (package R3 of
 * docs/audits/app-ui-ux-2026-11-15/RESULTS-DESIGN.md, section 3), hosted by
 * `SampleDetailDialog`. One coffee, in this order:
 *
 *   1. the score, with its context, its arithmetic in one line and ONE
 *      "¿Cómo se calculó?";
 *   2. quality, attribute by attribute: one dot plot on a fixed 1 to 9 scale
 *      (the reader's ring, the group's dot);
 *   3. what was found in it: the wheel at full size, "Comparar con", the
 *      descriptors as counted bars stage by stage, and what the reader marked;
 *   4. intensities: one dot plot on a fixed 0 to 15 scale;
 *   5. defective cups, by type;
 *   6. the same coffee served twice (the reader's own two evaluations);
 *   7. notes and the coffee: free notes, origin and preparation, the note
 *      after the close.
 *
 * It draws; it does not decide. Every group number arrives already gated:
 * `card` is `coffeeCards` (the score's context; the group's value per quality
 * attribute under the page's gate and from two included cuppers), `wheel`,
 * `defects` and `sheet` were built on the server (lib/reports/overview.ts,
 * lib/reports/coffeeSheet.ts), `comparison` is `buildPersonalComparison`
 * (closed sessions, three included cuppers per row, never the organizer's
 * lens). When the organizer reads ONE cupper (`cupperName`), only that
 * cupper's own evaluation is shown: no group part at all.
 *
 * A score is a number in ink. A flavour family's colour paints dots, bars and
 * petals only: never a word and never the ground behind a word.
 */

import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { DotPlot, type DotPlotItem } from "@/components/ui/DotPlot";
import { CountBar } from "@/components/ui/CountBar";
import { familyToneClass } from "@/components/ui/familyTone";
import { ScoreWithContext, formatScore, formatSigned } from "@/components/ui/ScoreWithContext";
import { Button, PillTabs } from "@/components/ui";
import { ExtrinsicSummary } from "@/components/results/ExtrinsicSummary";
import {
  ScoreBreakdownPanel,
  type GroupBreakdownData,
  type ScoreBreakdownTranslations,
} from "@/components/results/ScoreBreakdownPanel";
import { cooledPair, isAffectiveDeclaredPartial, isNotEvaluated } from "@/lib/affectivePartial";
import { AFFECTIVE_ATTRIBUTES, type SessionFormat } from "@/lib/constants";
import { PERCEPTUAL_BLOCKS, collectDescriptors, resolveDescriptor, resolveMainTaste } from "@/lib/descriptors";
import { canShowMyScore, type MyEvaluation } from "@/lib/evaluationState";
import { EXPRESS_NOTE_KEY } from "@/lib/expressSession";
import { fillPattern } from "@/lib/fillPattern";
import { wheelFamilyOf, type WheelFamilyId } from "@/lib/flavorWheel";
import { MARKET_KEY, MARKET_NOTE_KEY, readMarketNote } from "@/lib/marketNote";
import type { CoffeeCard, CompareOption } from "@/lib/reports/coffeeCards";
import { SHEET_GENERAL, type SheetData } from "@/lib/reports/coffeeSheet";
import type { DefectSummary } from "@/lib/reports/learnings";
import type { PersonalComparison } from "@/lib/reports/personalComparison";
import type { WheelData } from "@/lib/reports/wheelData";
import { INTENSITY_SCALE, QUALITY_SCALE, countBar } from "@/lib/resultsScales";
import type { SamplePrep } from "@/lib/samplePrep";
import type { ScoreRule } from "@/lib/scoreRule";
import { calcIndividualBreakdown, calcIndividualScore, hasIndividualScore } from "@/lib/scoring";
import type { RepeatDiff } from "@/app/[locale]/app/sessions/[id]/results/types";
import type { CardsStrings } from "./cardsStrings";
import { FlavorCompare } from "./FlavorCompare";
import { FlavorWheel } from "./FlavorWheel";
import type { OverviewStrings } from "./overviewStrings";
import type { ResultsPartsStrings } from "./partsStrings";
import type { SheetStrings } from "./sheetStrings";

type Lang = "es" | "en";
type Data = Record<string, unknown>;

/** Every string the sheet takes from `results.detail.*` (the drill-down's own words). */
export type SampleDetailTranslations = {
  fragrance: string;
  aroma: string;
  flavor: string;
  aftertaste: string;
  acidity: string;
  sweetness: string;
  mouthfeel: string;
  overall: string;
  notes: string;
  /** "Puntaje Café Sensible (base CVA)": the score, named in full once per sheet. */
  cvaScore: string;
  edit: string;
  noData: string;
  gusto: string;
  breakdown: ScoreBreakdownTranslations;
  inProgress?: string;
  notEvaluated?: string;
  expressNotes?: string;
  /** "market" note labels (`results.market.*`, S10 WP3a, A10). */
  market?: { label: string; known: string };
  /** A9 prep-data labels (`results.samplePrep.*`). */
  prep?: { roastDate: string; preparation: string; offProtocol: string };
  /** S10 WP3b (`results.partial.*`). `includesOne` / `includesMany` are raw `{n}` patterns. */
  partial?: { label: string; includesOne?: string; includesMany?: string };
};

/** The repeated-sample block and the two sentences of "tú vs. grupo" (`results.compare.*`). */
export type SheetCompareTranslations = {
  notAnError: string;
  repeatTitle: string;
  /** "Frente a {label}" */
  repeatVs: string;
  total: string;
  within: string;
  /** "diferencia de {x}" */
  beyond: string;
  /** "{mine} y {other}" */
  repeatValues: string;
  repeatNote: string;
};

// Attribute id (PERCEPTUAL_BLOCKS[].attrs) -> the key of its name.
const ROW_LABEL_KEY: Record<string, keyof SampleDetailTranslations> = {
  fragancia: "fragrance",
  aroma: "aroma",
  sabor: "flavor",
  sabor_residual: "aftertaste",
  acidez: "acidity",
  dulzor: "sweetness",
  sensacion: "mouthfeel",
  gusto: "gusto",
};

const num = (data: Data, key: string): number | null => {
  const v = data[key];
  return typeof v === "number" && v > 0 ? v : null;
};
const text = (data: Data, key: string): string => {
  const v = data[key];
  return typeof v === "string" ? v.trim() : "";
};

/** A descriptor's name and, when it is on the wheel, its family (for the dot). */
function describe(id: string, lang: Lang): { id: string; label: string; family: WheelFamilyId | null } | null {
  const info = resolveDescriptor(id, lang) ?? resolveMainTaste(id, lang);
  return info ? { id, label: info.label, family: wheelFamilyOf(id) } : null;
}

/** The descriptors under the given keys, a family dropped when one of its own
 *  descriptors is there too (the same thing is never listed at two levels). */
function marksOf(data: Data, keys: readonly string[], lang: Lang) {
  const ids = collectDescriptors(data, keys);
  const parents = new Set(ids.filter((id) => id.includes(":")).map((id) => id.split(":")[0]));
  return ids
    .filter((id) => id.includes(":") || !parents.has(id))
    .map((id) => describe(id, lang))
    .filter((d): d is NonNullable<typeof d> => d !== null);
}

/** One section of the sheet: a name, then its content. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-outline-variant pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-card leading-tight">{title}</h3>
      {children}
    </section>
  );
}

const quiet = "m-0 text-caption leading-snug text-on-surface-variant";
const plain = "m-0 text-body leading-snug text-on-surface";

/** A descriptor as words, with its family as a DOT beside it (never a filled pill). */
function Mark({ label, family }: { label: string; family: WheelFamilyId | null }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${familyToneClass(family)}`}>
      <span aria-hidden="true" className="size-[8px] shrink-0 rounded-full bg-[var(--family-tone)]" />
      {label}
    </span>
  );
}

export function SampleDetail({
  data,
  format,
  cupsPerSample,
  scoreRule,
  locale,
  myEvaluation,
  cupperName = null,
  referenceBadge = null,
  referencePinned = false,
  onEdit,
  card = null,
  aggregate = null,
  ownDelta = null,
  wheel = null,
  defects = null,
  sheet = null,
  comparison = null,
  repeatDiffs = [],
  compare = null,
  compareGround = "rings",
  extrinsic,
  extrinsicNote = null,
  prep = null,
  extra = null,
  familyLabels,
  blockLabels,
  parts,
  cards,
  overview,
  s,
  compareT,
  t,
}: {
  /** The evaluation shown: the viewer's own, or one cupper's when the organizer reads it. */
  data: Data;
  format: SessionFormat;
  cupsPerSample: number;
  /** Rule the shown evaluation was scored under ("v1" = before 2026-11). */
  scoreRule?: ScoreRule;
  locale: string;
  /** The viewer's OWN evaluation state; undefined when another cupper's is shown
   *  (always a sent one). Gates the total: an unsent draft never prints one. */
  myEvaluation?: MyEvaluation;
  /** Set when the organizer reads one cupper: no group part is shown then. */
  cupperName?: string | null;
  /** "Referencia" / "Referencia 2": only when this coffee is a reference. */
  referenceBadge?: string | null;
  /** This coffee is the fixed reference: its quality is a rule, not an opinion. */
  referencePinned?: boolean;
  onEdit?: () => void;
  /** The coffee's card (`coffeeCards`): the score's context and the quality rows. */
  card?: CoffeeCard<unknown> | null;
  /** The group's stored numbers, for its arithmetic. Null where the viewer may not read them. */
  aggregate?: (GroupBreakdownData & { partialCount?: number }) | null;
  /** The viewer's own score minus their own score of the reference; null when it does not apply. */
  ownDelta?: number | null;
  wheel?: WheelData | null;
  defects?: DefectSummary | null;
  sheet?: SheetData | null;
  comparison?: PersonalComparison | null;
  repeatDiffs?: RepeatDiff[];
  /** "Comparar con": the other coffees that may be laid over this one's petals
   *  (closed sessions only; decided by `compareOptions`). */
  compare?: {
    self: CompareOption;
    others: CompareOption[];
    /** A coffee's label and name: the legend, the table and a chip's spoken name. */
    names: Readonly<Record<string, string>>;
    /** What a chip prints beside the letter: the name once revealed, else the label. */
    short: Readonly<Record<string, string>>;
  } | null;
  compareGround?: "rings" | "families";
  extrinsic: Data;
  /** "Datos de origen editados el <fecha>". */
  extrinsicNote?: string | null;
  /** A9 prep data, already gated on the server (organizer, or a revealed sample). */
  prep?: SamplePrep | null;
  /** The note after the close (a slot: this component knows nothing of it). */
  extra?: ReactNode;
  familyLabels: Record<WheelFamilyId, string>;
  blockLabels: Readonly<Record<string, string>>;
  parts: ResultsPartsStrings;
  cards: CardsStrings;
  overview: OverviewStrings;
  s: SheetStrings;
  compareT: SheetCompareTranslations;
  t: SampleDetailTranslations;
}) {
  const lang: Lang = locale === "en" ? "en" : "es";
  const own = cupperName === null;
  const showDescriptive = format !== "affective";
  const showAffective = format !== "descriptive";
  const [stage, setStage] = useState<string>(SHEET_GENERAL);
  const [allRows, setAllRows] = useState(false);
  const [laid, setLaid] = useState<string[]>([]);

  const filled = Object.entries(data)
    .filter(([k]) => k !== EXPRESS_NOTE_KEY && k !== MARKET_KEY && k !== MARKET_NOTE_KEY)
    .some(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== "" && v !== 0));

  // ── 1. the score ──────────────────────────────────────────────────────────
  const scoreAllowed = myEvaluation ? canShowMyScore(myEvaluation) : true;
  const isPartial = showAffective && isAffectiveDeclaredPartial(data);
  const total =
    showAffective && filled && scoreAllowed && hasIndividualScore(data)
      ? calcIndividualScore(data, cupsPerSample, { rule: scoreRule })
      : null;
  const totalNum = typeof total === "number" ? total : null;
  const context = own ? (card?.context ?? null) : null;
  const groupShown = own && aggregate !== null && aggregate.communityScore != null;
  const stateChip =
    myEvaluation?.status === "draft"
      ? (t.inProgress ?? null)
      : myEvaluation?.status === "none"
        ? (t.notEvaluated ?? null)
        : null;
  const partials = aggregate?.partialCount ?? 0;
  const partialPattern = partials === 1 ? t.partial?.includesOne : t.partial?.includesMany;
  const nameOfLens = cupperName ?? "";

  // ── 2. quality, attribute by attribute ────────────────────────────────────
  const qualityItems: DotPlotItem[] = showAffective
    ? AFFECTIVE_ATTRIBUTES.map((attr) => {
        const row = own ? card?.quality?.find((q) => q.id === attr.id) : null;
        return {
          id: attr.id,
          label: cards.attributes[attr.id] ?? attr.label,
          mine: own ? (row?.mine ?? null) : num(data, `${attr.id}_final`),
          group: own ? (row?.group ?? null) : null,
        };
      })
    : [];
  const qualityHasGroup = qualityItems.some((q) => q.group !== null);
  const qualityHasAny = qualityItems.some((q) => q.mine !== null || q.group !== null);
  const cooledLines = showAffective
    ? AFFECTIVE_ATTRIBUTES.flatMap((attr) => {
        const label = cards.attributes[attr.id] ?? attr.label;
        if (isNotEvaluated(data, attr.id)) return [fillPattern(s.notEvaluated, { label })];
        const pair = cooledPair(data, attr.id);
        return pair ? [fillPattern(s.cooled, { label, from: pair.from, to: pair.to })] : [];
      })
    : [];
  // the organizer reading a cupper: the plot's ring is that cupper's, by name
  const lensPlot = own
    ? parts.dotPlot
    : { ...parts.dotPlot, mineOnly: "{mine}", legendMine: fillPattern(s.valuesOf, { name: nameOfLens }) };

  // ── 3. what was found ─────────────────────────────────────────────────────
  const groupWheel = own && wheel?.status === "ok" && wheel.scope === "group" ? wheel : null;
  const ownWheel = own && wheel?.status === "ok" && wheel.scope === "own" && Object.keys(wheel.direct).length > 0 ? wheel : null;
  const tooFew = own && wheel?.status === "too_few";
  const stages = sheet ? sheet.blocks.filter((b) => b.id === SHEET_GENERAL || b.items.length > 0) : [];
  const activeStage = stages.find((b) => b.id === stage) ?? stages[0] ?? null;
  const stageKeys =
    activeStage && activeStage.id !== SHEET_GENERAL
      ? (PERCEPTUAL_BLOCKS.find((b) => b.id === activeStage.id)?.descKeys ?? [])
      : PERCEPTUAL_BLOCKS.flatMap((b) => [...b.descKeys]);
  const mineInStage = new Set(collectDescriptors(data, stageKeys));
  const ROWS = 8;
  const stageRows = activeStage ? (allRows ? activeStage.items : activeStage.items.slice(0, ROWS)) : [];
  const marks = showDescriptive
    ? PERCEPTUAL_BLOCKS.flatMap((block) =>
        (block.attrs ?? []).map((attr) => ({
          id: attr.id,
          label: String(t[ROW_LABEL_KEY[attr.id]] ?? attr.label[lang]),
          items: attr.descKey ? marksOf(data, [attr.descKey], lang) : [],
        })),
      ).filter((row) => row.items.length > 0)
    : [];
  const laidOptions = compare ? compare.others.filter((o) => laid.includes(o.id)) : [];
  const shared = own && comparison?.status === "ok" ? comparison.descriptive : null;

  // ── 4. intensities ────────────────────────────────────────────────────────
  const groupIntensity = new Map(
    (own && comparison?.status === "ok" ? (comparison.descriptive?.intensities ?? []) : []).map((r) => [r.id, r.group]),
  );
  const intensityItems: DotPlotItem[] = showDescriptive
    ? PERCEPTUAL_BLOCKS.flatMap((block) =>
        block.kind === "desc"
          ? (block.attrs ?? []).map((attr) => ({
              id: attr.id,
              label: String(t[ROW_LABEL_KEY[attr.id]] ?? attr.label[lang]),
              mine: num(data, `${attr.id}_int`),
              group: groupIntensity.get(attr.id) ?? null,
            }))
          : [],
      )
    : [];
  const intensityHasGroup = intensityItems.some((i) => i.group !== null);
  const intensityHasAny = intensityItems.some((i) => i.mine !== null || i.group !== null);

  // ── 7. notes ──────────────────────────────────────────────────────────────
  const noteRows = PERCEPTUAL_BLOCKS.flatMap((block) =>
    (block.attrs ?? []).flatMap((attr) => {
      const affKey = "affKey" in attr ? attr.affKey : undefined;
      const note = text(data, `${attr.id}_notas`) || (affKey ? text(data, `${affKey}_notas`) : "");
      return note ? [{ id: attr.id, label: String(t[ROW_LABEL_KEY[attr.id]] ?? attr.label[lang]), note }] : [];
    }),
  );
  const overallNote = text(data, "impresion_global_notas");
  const expressNote = text(data, EXPRESS_NOTE_KEY);
  const marketNote = showAffective ? readMarketNote(data) : null;
  const hasNotes = noteRows.length > 0 || overallNote !== "" || expressNote !== "" || marketNote !== null;

  return (
    <div className="flex flex-col gap-4 font-sans" data-coffee-sheet="">
      {referenceBadge || stateChip || onEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 flex flex-wrap items-center gap-2">
            {referenceBadge ? (
              <span className="inline-flex items-center rounded-pill border border-outline-variant px-2 py-px text-caption font-semibold text-on-surface-variant">
                {referenceBadge}
              </span>
            ) : null}
            {stateChip ? (
              <span className="inline-flex items-center rounded-pill border border-outline-variant px-2 py-px text-caption font-semibold text-on-surface-variant">
                {stateChip}
              </span>
            ) : null}
          </p>
          {onEdit ? (
            <Button size="sm" variant="secondary" icon={<Pencil size={13} aria-hidden />} onClick={onEdit} className="shrink-0">
              {t.edit}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* 1. The score: named in full once, the number in ink, its arithmetic in one line. */}
      {showAffective ? (
        <Section title={own ? t.cvaScore : fillPattern(s.scoreOfCupper, { name: nameOfLens })}>
          {context ? (
            <ScoreWithContext
              context={
                // a fixed reference's number is a rule, not an average: the number alone
                referencePinned
                  ? { ...context, spread: null, included: null, mine: null, difference: null, indicative: false, suppressed: false }
                  : context
              }
              strings={parts.score}
              size="lg"
            />
          ) : totalNum !== null ? (
            <p className="m-0 font-display text-[42px] font-medium leading-none text-on-surface [font-variant-numeric:lining-nums_tabular-nums]">
              {formatScore(totalNum)}
            </p>
          ) : null}
          {isPartial && totalNum === null ? <p className={quiet}>{t.partial?.label ?? cards.partialLabel}</p> : null}
          {!own && totalNum === null && !isPartial ? <p className={quiet}>{parts.score.noScore}</p> : null}
          {own && ownDelta !== null ? <p className={quiet}>{fillPattern(s.yourDelta, { delta: formatSigned(ownDelta) })}</p> : null}
          {groupShown && partials > 0 && partialPattern ? (
            <p className={quiet}>{fillPattern(partialPattern, { n: partials })}</p>
          ) : null}
          <ScoreBreakdownPanel
            individual={
              totalNum !== null
                ? {
                    breakdown: calcIndividualBreakdown(data, cupsPerSample, { rule: scoreRule }),
                    data,
                    label: own ? s.howOwn : fillPattern(s.howCupper, { name: nameOfLens }),
                  }
                : null
            }
            group={groupShown && aggregate ? { group: aggregate, cupsPerSample, label: s.howGroup } : null}
            setup={{ cupsPerSample, uniformityTracked: cupsPerSample >= 2, roundingEnforced: true }}
            t={t.breakdown}
          />
        </Section>
      ) : null}

      {/* 2. Quality on ONE fixed scale: the reader's ring, the group's dot. */}
      {showAffective && (referencePinned || qualityHasAny || cooledLines.length > 0) ? (
        <Section title={qualityHasGroup && !referencePinned ? s.youAndGroup : s.quality}>
          {referencePinned ? (
            <p className={quiet}>{s.qualityPinned}</p>
          ) : (
            <>
              {qualityHasAny ? (
                <DotPlot
                  scale={QUALITY_SCALE}
                  items={qualityItems}
                  strings={lensPlot}
                  showGroup={qualityHasGroup}
                  ariaLabel={qualityHasGroup ? s.youAndGroup : s.quality}
                />
              ) : null}
              {cooledLines.map((line) => (
                <p key={line} className={quiet}>
                  {line}
                </p>
              ))}
              {qualityHasGroup ? <p className={quiet}>{compareT.notAnError}</p> : null}
            </>
          )}
        </Section>
      ) : null}

      {/* 3. What was found in it. Never in an affective session. */}
      {showDescriptive ? (
        <Section
          title={groupWheel ? s.flavourGroup : own ? s.flavourOwn : fillPattern(s.flavourCupper, { name: nameOfLens })}
        >
          {tooFew ? <p className={quiet}>{s.flavourTooFew}</p> : null}
          {groupWheel || ownWheel ? (
            laidOptions.length > 0 && compare && groupWheel ? (
              <FlavorCompare
                base={{
                  id: compare.self.id,
                  tag: compare.self.tag,
                  name: compare.names[compare.self.id] ?? compare.self.tag,
                  counts: compare.self.series.counts,
                  n: compare.self.series.n,
                }}
                others={laidOptions.map((o) => ({
                  id: o.id,
                  tag: o.tag,
                  name: compare.names[o.id] ?? o.tag,
                  counts: o.series.counts,
                  n: o.series.n,
                }))}
                familyLabels={familyLabels}
                strings={parts.compare}
                ground={compareGround}
              />
            ) : (
              groupWheel ? (
                <FlavorWheel counts={groupWheel.rollup} n={groupWheel.n} familyLabels={familyLabels} strings={parts.wheel} />
              ) : (
                // the reader's own marks are not "found by 1 of 1": the small wheel, no counts
                <div className="flex justify-center [--wheel-medium:132px]">
                  <FlavorWheel
                    counts={ownWheel!.rollup}
                    n={ownWheel!.n}
                    familyLabels={familyLabels}
                    strings={parts.wheel}
                    size="medium"
                    decorative
                  />
                </div>
              )
            )
          ) : null}

          {/* "Comparar con": other coffees as outlines over this one's petals. */}
          {groupWheel && compare && compare.others.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-caption font-semibold text-on-surface">{s.compareWith}</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label={s.compareWith}>
                {compare.others.map((o) => {
                  const on = laid.includes(o.id);
                  const full = !on && laid.length >= 2;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={on}
                      aria-disabled={full ? true : undefined}
                      aria-label={compare.names[o.id] ?? o.tag}
                      onClick={() =>
                        setLaid((prev) => (prev.includes(o.id) ? prev.filter((x) => x !== o.id) : prev.length >= 2 ? prev : [...prev, o.id]))
                      }
                      className={`inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-pill border bg-surface-container-lowest pl-2 pr-3.5 text-body leading-tight ${
                        on
                          ? "border-on-surface font-semibold text-on-surface"
                          : full
                            ? "border-dashed border-outline-variant text-on-surface-variant"
                            : "border-outline-variant text-on-surface-variant"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-flex size-[26px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-caption font-semibold leading-none ${
                          on ? "border-on-surface bg-on-surface text-surface-container-lowest" : "border-current"
                        }`}
                      >
                        {o.tag}
                      </span>
                      <span className="min-w-0 truncate">{compare.short[o.id] ?? compare.names[o.id] ?? o.tag}</span>
                    </button>
                  );
                })}
              </div>
              <p className={quiet}>{s.compareHint}</p>
            </div>
          ) : null}

          {/* The panel's descriptors, counted by people, stage by stage. */}
          {sheet && activeStage ? (
            <div className="flex flex-col gap-2">
              {stages.length > 1 ? (
                <PillTabs
                  items={stages.map((b) => ({ id: b.id, label: blockLabels[b.id] ?? b.id }))}
                  value={activeStage.id}
                  onChange={(id) => {
                    setStage(id);
                    setAllRows(false);
                  }}
                  ariaLabel={s.stages}
                  size="sm"
                />
              ) : null}
              {stageRows.length === 0 ? (
                <p className={quiet}>{s.stageNobody}</p>
              ) : (
                <ul className="m-0 list-none p-0" data-sheet-descriptors="">
                  {stageRows.map((d) => (
                    <CountBar
                      key={d.id}
                      as="li"
                      label={d.label}
                      bar={countBar(d.count, sheet.n)}
                      valueText={fillPattern(parts.counted.countOf, { count: d.count, n: sheet.n })}
                      family={d.family}
                      marked={mineInStage.has(d.id)}
                      markText={parts.counted.chosenByYou}
                    />
                  ))}
                </ul>
              )}
              {stageRows.some((d) => mineInStage.has(d.id)) ? (
                <p className={`${quiet} flex items-center gap-2`}>
                  <span
                    aria-hidden="true"
                    className="mx-[3px] size-[10px] shrink-0 rounded-full bg-surface-container-high outline outline-[1.5px] outline-offset-2 outline-on-surface"
                  />
                  {parts.counted.chosenByYou}
                </p>
              ) : null}
              {activeStage.items.length > ROWS ? (
                <button
                  type="button"
                  className="inline-flex min-h-[44px] w-fit items-center text-body font-semibold text-primary-container underline-offset-2 hover:underline"
                  aria-expanded={allRows}
                  onClick={() => setAllRows((v) => !v)}
                >
                  {allRows ? s.showFewer : fillPattern(s.showAll, { n: activeStage.items.length })}
                </button>
              ) : null}
            </div>
          ) : null}

          {shared && (shared.matches.length > 0 || shared.missed.length > 0) ? (
            <div className="flex flex-col gap-1">
              {shared.matches.length > 0 ? (
                <p className={plain}>{fillPattern(s.shared, { list: shared.matches.map((d) => d.label).join(", ") })}</p>
              ) : null}
              {shared.missed.length > 0 ? (
                <p className={quiet}>{fillPattern(s.notShared, { list: shared.missed.map((d) => d.label).join(", ") })}</p>
              ) : null}
            </div>
          ) : null}

          {/* What the reader marked, stage by stage: words, with the family as a dot. */}
          {marks.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {groupWheel || tooFew ? (
                <h4 className="font-sans text-caption font-semibold leading-tight text-on-surface">
                  {groupWheel ? `${s.flavourOwn} · ${s.marksTitle}` : s.marksTitle}
                </h4>
              ) : null}
              <dl className="m-0 grid grid-cols-[minmax(84px,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-body leading-snug" data-sheet-marks="">
                {marks.map((row) => (
                  <div key={row.id} className="contents">
                    <dt className="text-on-surface-variant">{row.label}</dt>
                    <dd className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-on-surface">
                      {row.items.map((d) => (
                        <Mark key={d.id} label={d.label} family={d.family} />
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : !groupWheel && !tooFew ? (
            <p className={quiet}>{s.flavourNone}</p>
          ) : null}
        </Section>
      ) : null}

      {/* 4. Intensities on ONE fixed scale. */}
      {showDescriptive && intensityHasAny ? (
        <Section title={s.intensities}>
          <DotPlot
            scale={INTENSITY_SCALE}
            items={intensityItems.filter((i) => i.mine !== null || i.group !== null)}
            strings={lensPlot}
            showGroup={intensityHasGroup}
            ariaLabel={s.intensities}
          />
          {intensityHasGroup && comparison?.status === "ok" && comparison.partial ? (
            <p className={quiet}>{s.intensitiesGroupNote}</p>
          ) : null}
        </Section>
      ) : null}

      {/* 5. Defective cups, by type. The one place the error red appears. */}
      {own && defects && defects.cups > 0 ? (
        <Section title={s.defects}>
          <div className="flex gap-2">
            <span aria-hidden="true" className="mt-[5px] size-[8px] shrink-0 rounded-full bg-error" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="m-0 text-body font-semibold leading-snug text-on-surface [font-variant-numeric:tabular-nums]">
                {defects.cups === 1 ? overview.defectCupsOne : fillPattern(overview.defectCupsMany, { n: defects.cups })}
              </p>
              <p className={quiet}>
                {defects.types
                  .map((type) =>
                    fillPattern(overview.defectType, {
                      type: type.type === null ? overview.defectUnspecified : (overview.defectTypes[type.type] ?? type.type),
                      n: type.cups,
                    }),
                  )
                  .join(" · ")}
              </p>
              {groupShown && defects.n > 1 ? (
                <p className={quiet}>{fillPattern(overview.defectBy, { k: defects.cuppers, n: defects.n })}</p>
              ) : null}
            </div>
          </div>
        </Section>
      ) : null}

      {/* 6. The same coffee served twice: the reader's own two evaluations. */}
      {own && repeatDiffs.length > 0 ? (
        <Section title={compareT.repeatTitle}>
          {repeatDiffs.map((d) => (
            <div key={d.partnerLabel} className="flex flex-col gap-1">
              <p className="m-0 text-caption font-semibold text-on-surface-variant">
                {fillPattern(compareT.repeatVs, { label: d.partnerLabel })}
              </p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {[...(d.total ? [{ ...d.total, label: compareT.total }] : []), ...d.intensities].map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-3 text-body">
                    <span className="text-on-surface">{r.label}</span>
                    <span className="text-right text-on-surface-variant [font-variant-numeric:tabular-nums]">
                      {fillPattern(compareT.repeatValues, { mine: r.mine, other: r.other })}
                      {" · "}
                      {r.within ? compareT.within : fillPattern(compareT.beyond, { x: Math.abs(r.diff) })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className={quiet}>{compareT.repeatNote}</p>
        </Section>
      ) : null}

      {/* 7. Notes, and the coffee itself. */}
      {!filled ? <p className={quiet}>{t.noData}</p> : null}
      {hasNotes ? (
        <Section title={s.notes}>
          <dl className="m-0 grid grid-cols-[minmax(84px,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-body leading-snug" data-sheet-notes="">
            {noteRows.map((row) => (
              <div key={row.id} className="contents">
                <dt className="text-on-surface-variant">{row.label}</dt>
                <dd className="m-0 whitespace-pre-wrap text-on-surface">{row.note}</dd>
              </div>
            ))}
            {overallNote ? (
              <div className="contents">
                <dt className="text-on-surface-variant">{t.overall}</dt>
                <dd className="m-0 whitespace-pre-wrap text-on-surface">{overallNote}</dd>
              </div>
            ) : null}
            {expressNote ? (
              <div className="contents">
                <dt className="text-on-surface-variant">{t.expressNotes ?? s.notes}</dt>
                <dd className="m-0 whitespace-pre-wrap text-on-surface">{expressNote}</dd>
              </div>
            ) : null}
            {marketNote && t.market ? (
              <div className="contents">
                <dt className="text-on-surface-variant">{t.market.label}</dt>
                <dd className="m-0 whitespace-pre-wrap text-on-surface">
                  {marketNote.note ? `${t.market.known}: ${marketNote.note}` : t.market.known}
                </dd>
              </div>
            ) : null}
          </dl>
        </Section>
      ) : null}
      {extra}

      {Object.keys(extrinsic).length > 0 || extrinsicNote || (prep && t.prep) ? (
        <Section title={s.theCoffee}>
          {/* origin / process / trade: it guards itself when empty */}
          <ExtrinsicSummary data={extrinsic} />
          {extrinsicNote ? <p className={quiet}>{extrinsicNote}</p> : null}
          {/* A9: roast date / preparation / off-protocol (organizer, or revealed). */}
          {prep && t.prep ? (
            <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-body leading-snug">
              {prep.roastDate ? (
                <div className="contents">
                  <dt className="text-on-surface-variant">{t.prep.roastDate}</dt>
                  <dd className="m-0 text-on-surface">{prep.roastDate}</dd>
                </div>
              ) : null}
              {prep.preparationNote ? (
                <div className="contents">
                  <dt className="text-on-surface-variant">{t.prep.preparation}</dt>
                  <dd className="m-0 text-on-surface">{prep.preparationNote}</dd>
                </div>
              ) : null}
              {prep.offProtocol ? (
                <div className="contents">
                  <dt className="text-on-surface-variant">{t.prep.offProtocol}</dt>
                  <dd className="m-0 text-on-surface">{prep.offProtocolNote ?? "•"}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}
