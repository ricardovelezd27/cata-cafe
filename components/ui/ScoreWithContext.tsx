import type { ReactNode } from "react";
import { fillPattern } from "@/lib/fillPattern";
import { formatScore, formatSigned } from "@/lib/scoreFormat";
import type { ScoreContext } from "@/lib/scoreContext";
import styles from "./ScoreWithContext.module.css";

export type ScoreContextStrings = {
  /** "± {sd}" */
  spread: string;
  /** "{n} de {total} incluidos" */
  included: string;
  /** "{n} incluidos" (the number of sent evaluations is not known) */
  includedNoTotal: string;
  /** "tú {score}" */
  mine: string;
  /** "diferencia {difference}" */
  difference: string;
  /** "Δ {delta} vs. referencia" */
  deltaVsReference: string;
  /** "tu puntaje": beside a score that is the reader's own. */
  ownScore: string;
  /** "sin puntaje" */
  noScore: string;
  /** Printed in place of a score that does not exist: "–". */
  none: string;
  indicative: string;
};

/** A pattern with ONE placeholder, the placeholder's value a step heavier. */
function withNumber(pattern: string, key: string, value: string): ReactNode {
  const token = `{${key}}`;
  const at = pattern.indexOf(token);
  if (at < 0) return fillPattern(pattern, { [key]: value });
  return (
    <>
      {pattern.slice(0, at)}
      <span className={styles.num}>{value}</span>
      {pattern.slice(at + token.length)}
    </>
  );
}

/**
 * A score with its context, in the app's one wording: the number, then
 * "± 2.9 · 7 de 8 incluidos", then "tú 90.75 · diferencia +2.00", then
 * "Δ +3.25 vs. referencia", then the neutral flags.
 *
 * It decides NOTHING: every field comes from `scoreContext` (lib/scoreContext.ts),
 * which already applied the rules (a spread and a difference from three included
 * cuppers, "n de N incluidos" beside every community score). A field that is null is simply not printed. The number is ink.
 */
export function ScoreWithContext({
  context,
  strings,
  size = "md",
  showScore = true,
  detail = "full",
}: {
  context: ScoreContext;
  strings: ScoreContextStrings;
  size?: "sm" | "md" | "lg";
  /** False where the number is printed elsewhere (a ranking row prints it at the end). */
  showScore?: boolean;
  /** "brief": only what tells how firm the number is (the spread, the n, and
   *  "indicativo"). For a row of a ranking, where the reader's own score is the
   *  ring on the strip. */
  detail?: "full" | "brief";
}) {
  const full = detail === "full";
  const first: ReactNode[] = [];
  if (context.score === null) first.push(strings.noScore);
  else if (full && context.basis === "mine") first.push(strings.ownScore);
  if (context.spread !== null) first.push(withNumber(strings.spread, "sd", context.spread.toFixed(1)));
  if (context.included) {
    first.push(
      context.included.total === null
        ? fillPattern(strings.includedNoTotal, { n: context.included.n })
        : fillPattern(strings.included, { n: context.included.n, total: context.included.total }),
    );
  }
  const second: ReactNode[] = [];
  if (full && context.mine !== null) second.push(withNumber(strings.mine, "score", formatScore(context.mine)));
  if (full && context.difference !== null) {
    second.push(withNumber(strings.difference, "difference", formatSigned(context.difference)));
  }
  const third: ReactNode[] =
    !full || context.deltaVsReference === null
      ? []
      : [withNumber(strings.deltaVsReference, "delta", formatSigned(context.deltaVsReference))];
  const flags: string[] = [];
  if (context.indicative || context.suppressed) flags.push(strings.indicative);

  const line = (parts: ReactNode[], key: string) =>
    parts.length === 0 ? null : (
      <p key={key} className={styles.line}>
        {parts.map((part, i) => (
          <span key={i}>
            {i > 0 ? " · " : null}
            {part}
          </span>
        ))}
      </p>
    );

  return (
    <div className={styles.root}>
      {showScore ? (
        <div className={styles.head}>
          <span className={`${styles.score} ${styles[size]}`}>
            {context.score === null ? strings.none : formatScore(context.score)}
          </span>
        </div>
      ) : null}
      {line(first, "first")}
      {line(second, "second")}
      {line(third, "third")}
      {flags.length > 0 ? (
        <div className={styles.flags}>
          {flags.map((flag) => (
            <span key={flag} className={styles.flag}>
              {flag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
