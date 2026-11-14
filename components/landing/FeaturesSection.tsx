import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import DeckRail from "./DeckRail";
import ScrollDeck from "./ScrollDeck";
import SectionHeading from "./SectionHeading";
import {
  ShieldCheck,
  Eye,
  Sparkles,
  WifiOff,
  FileText,
  Users,
  Check,
  type LucideIcon,
} from "lucide-react";

// Every cell has the same three parts: a name, an explanation and a small
// drawing of the feature. The drawings are illustrative, never real session
// data, and (except the score line, which is plain text) decorative.

// Deterministic 8x5 "attribute x cupper" deviation mini-heatmap.
const HEATMAP_COLS = 8;
const HEATMAP_ROWS = 5;
const HEATMAP_LIT = new Set([2, 5, 9, 12, 14, 18, 21, 22, 26, 29, 30, 33, 35, 37, 38, 39]);
const HEATMAP_STRONG = new Set([5, 14, 22, 33, 38]);

function DeviationHeatmap({ ariaLabel }: { ariaLabel: string }) {
  const cell = 14;
  const gap = 3;
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${HEATMAP_COLS * (cell + gap)} ${HEATMAP_ROWS * (cell + gap)}`}
      className="h-auto w-full max-w-[190px]"
    >
      {Array.from({ length: HEATMAP_ROWS * HEATMAP_COLS }, (_, i) => {
        const x = (i % HEATMAP_COLS) * (cell + gap);
        const y = Math.floor(i / HEATMAP_COLS) * (cell + gap);
        const lit = HEATMAP_LIT.has(i);
        const strong = HEATMAP_STRONG.has(i);
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={cell}
            height={cell}
            rx={3}
            className={
              !lit
                ? "fill-surface opacity-15"
                : strong
                  ? "fill-secondary-container opacity-80"
                  : "fill-primary-fixed opacity-60"
            }
          />
        );
      })}
    </svg>
  );
}

// The 1–9 track with the instructor's reference and the group gathered
// around it: the same picture the constellation draws for step 3.
// Positions are percentages along the track.
const COHORT = [58, 71, 76, 79, 81, 83, 86, 90];
const REFERENCE = 81.25; // 7.5 on a 1–9 scale

function AlignmentTrack() {
  return (
    <div aria-hidden="true" className="relative h-12 w-full max-w-[360px]">
      <div className="absolute inset-x-0 top-1/2 h-px bg-surface/25" />
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-surface/35"
          style={{ left: `${(i / 8) * 100}%` }}
        />
      ))}
      <span
        className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-primary-fixed"
        style={{ left: `${REFERENCE}%` }}
      />
      {COHORT.map((left) => (
        <span
          key={left}
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary-container"
          style={{ left: `${left}%` }}
        />
      ))}
    </div>
  );
}

// "Every score shows how it was calculated": the arithmetic in one line, as
// the app prints it after an evaluation is sent. Real text, so it is read.
function ScoreFormula({
  parts,
}: {
  parts: { value: string; label: string; sign?: string }[];
}) {
  return (
    <div className="flex items-start gap-3">
      {parts.map((part) => (
        <div key={part.label} className="flex items-start gap-3">
          {part.sign ? (
            <span aria-hidden="true" className="pt-0.5 font-serif text-2xl leading-none text-secondary-container">
              {part.sign}
            </span>
          ) : null}
          <div>
            <p className="font-serif tabular-nums text-3xl leading-none text-surface">
              {part.value}
            </p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface/65">
              {part.label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// "Works offline, syncs when the signal is back": evaluations along a line.
// Filled dots are on the server; while the line is broken (no signal) they
// are kept on the device, and they fill in once it is whole again.
const OFFLINE_DOTS: ("synced" | "kept")[] = ["synced", "synced", "kept", "kept", "kept", "synced"];

function OfflineTrack() {
  return (
    <div aria-hidden="true" className="flex w-full max-w-[320px] items-center">
      {OFFLINE_DOTS.map((state, i) => {
        const next = OFFLINE_DOTS[i + 1];
        // The stretch after this dot is broken when either end is offline.
        const broken = state === "kept" || next === "kept";
        return (
          <div key={i} className="flex flex-1 items-center last:flex-none">
            <span
              className={
                state === "synced"
                  ? "h-3 w-3 shrink-0 rounded-full bg-primary-fixed"
                  : "h-3 w-3 shrink-0 rounded-full border-[1.5px] border-secondary-container"
              }
            />
            {next ? (
              <span
                className={
                  broken
                    ? "mx-1 h-0 flex-1 border-t-[1.5px] border-dashed border-secondary-container/70"
                    : "mx-1 h-0 flex-1 border-t-[1.5px] border-primary-fixed/70"
                }
              />
            ) : null}
          </div>
        );
      })}
      <span className="ml-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    </div>
  );
}

// "A report and a certificate per session": two sheets, the report in front
// (a title, the score, three bars) and the certificate behind (a seal).
function ReportSheets() {
  return (
    <div aria-hidden="true" className="relative h-[112px] w-[150px]">
      <div className="absolute left-[58px] top-0 h-[104px] w-[80px] rotate-[5deg] rounded-[6px] border border-surface/30 bg-surface/[0.07] p-2.5">
        <span className="block h-1 w-8 rounded-full bg-surface/35" />
        <span className="mt-3 block h-1 w-12 rounded-full bg-surface/25" />
        <span className="mt-1.5 block h-1 w-10 rounded-full bg-surface/25" />
        <span className="absolute bottom-2.5 right-2.5 h-6 w-6 rounded-full border-[1.5px] border-secondary-container" />
      </div>
      <div className="absolute left-0 top-2 h-[104px] w-[80px] -rotate-[3deg] rounded-[6px] border border-surface/30 bg-stage-raised p-2.5">
        <span className="block h-1 w-9 rounded-full bg-surface/45" />
        <span className="mt-2.5 block h-3 w-10 rounded-[3px] bg-surface/80" />
        <span className="mt-3 block h-1 w-full rounded-full bg-primary-fixed/70" />
        <span className="mt-1.5 block h-1 w-4/5 rounded-full bg-primary-fixed/70" />
        <span className="mt-1.5 block h-1 w-11/12 rounded-full bg-primary-fixed/70" />
        <span className="absolute bottom-2 left-2.5 text-[8px] font-semibold tracking-[0.12em] text-surface/70">
          PDF
        </span>
      </div>
    </div>
  );
}

type Item = 1 | 2 | 3 | 4 | 5 | 6;

// Reading order: the method, how the score is shown, the group, what the AI
// adds, then the two practical ones.
const CELLS: { item: Item; Icon: LucideIcon }[] = [
  { item: 1, Icon: ShieldCheck },
  { item: 2, Icon: Eye },
  { item: 6, Icon: Users },
  { item: 3, Icon: Sparkles },
  { item: 4, Icon: WifiOff },
  { item: 5, Icon: FileText },
];

const DECK_ID = "que-incluye";

/**
 * "Qué incluye": six cells of EQUAL weight. Each one is the GLASS surface
 * (the constellation is behind this section) and has the same three parts:
 * the feature's name, a short explanation, and a small drawing of it at the
 * bottom of the cell. No cell is only text.
 *
 * Wide screens: a 3 x 2 grid (2 x 3 on a tablet); the drawings sit on one
 * line across a row.
 *
 * On a phone the section is a scroll stage (`ScrollDeck`, `.deck-*` CSS): the
 * header stays under the top bar and the six cells come one at a time as the
 * page scrolls. Glass cells never pile up (one would be read through the
 * other), so the cell in front leaves as the next one arrives.
 */
export default async function FeaturesSection({ locale }: { locale: string }) {
  const t = await getTranslations("landing.features");

  const facts = [t("factsSheets"), t("factsAttrs"), t("factsRef")].map((fact) => {
    const [numeral, ...rest] = fact.split(" ");
    return { numeral, label: rest.join(" ") };
  });

  const number = new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", {
    minimumFractionDigits: 2,
  });

  const drawing: Record<Item, ReactNode> = {
    1: (
      // Numeral over its label, like the score line: three short columns
      // that stay on one row in the narrowest cell.
      <dl className="flex gap-6">
        {facts.map((fact) => (
          <div key={fact.label} className="flex flex-col-reverse">
            <dt className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface/65">
              {fact.label}
            </dt>
            <dd className="font-serif tabular-nums text-3xl leading-none text-surface">
              {fact.numeral}
            </dd>
          </div>
        ))}
      </dl>
    ),
    2: (
      <ScoreFormula
        parts={[
          { value: number.format(84), label: t("formulaBase") },
          { value: number.format(0.75), label: t("formulaDeduction"), sign: "−" },
          { value: number.format(83.25), label: t("formulaScore"), sign: "=" },
        ]}
      />
    ),
    3: <DeviationHeatmap ariaLabel={t("heatmapAria")} />,
    4: <OfflineTrack />,
    5: <ReportSheets />,
    6: <AlignmentTrack />,
  };

  return (
    // No data-fold: this section and the next are where the constellation
    // drifts from the track (step 3) to the founding "100". A formation held
    // here would put its densest cluster under a cell's text.
    <section id={DECK_ID} data-deck="swap" className="cv-auto relative z-10 bg-transparent">
      <div className="deck-stage mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="deck-head">
          <SectionHeading
            eyebrow={t("eyebrow")}
            title={t("title")}
            assertion={t("titleAssertion")}
          />
        </div>
        <DeckRail count={CELLS.length} />

        <ul
          data-deck-area=""
          className="deck-cards deck-swap mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {CELLS.map(({ item, Icon }) => (
            // The <li> is the card the phone stage moves; the reveal lives on
            // the surface inside it, because ScrollFx clears every inline
            // style of a data-reveal element (it would wipe the stage values).
            <li key={item} data-deck-card="" className="deck-card flex">
              <div
                data-reveal
                className="features-cell surface-glass flex flex-1 flex-col rounded-md p-7"
              >
                <div className="flex items-start gap-3">
                  <Icon aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-primary-fixed" />
                  <div>
                    <h3 className="font-serif text-2xl leading-tight text-surface">
                      {t(`item${item}.title`)}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-surface/80">
                      {t(`item${item}.desc`)}
                    </p>
                  </div>
                </div>
                {/* Pushed to the bottom and given one height, so the drawings
                    of a row share a baseline whatever the text's length;
                    centred in the card, at every width. */}
                <div className="mt-auto flex min-h-[112px] items-end justify-center pt-7">
                  {drawing[item]}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <ScrollDeck rootId={DECK_ID} />
    </section>
  );
}
