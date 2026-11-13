/**
 * The coffee's LIFETIME score (S10 WP1c; docs/product/cata-descentralizada-puntaje.md
 * §3, "Puntaje del café"). A NEW computation at read time: it is never stored,
 * never read or written by the SQL trigger or AggregateScore, and always uses
 * the CURRENT rule (v2) — even over evaluations stored before 2026-11 (their
 * ratings and flags are data; only their stored totals are history).
 *
 * Pure and dependency-light: all arithmetic comes from lib/scoring.ts
 * (calcRawScore, evaluationCupCounts, cupDeduction, calcCommunityScore which
 * applies roundToQuarter and the 0..100 clamp). The caller passes the samples
 * that survived filterCoffeeSamples (closed session, revealed sample, excluded
 * cuppers removed): this function adds or relaxes no gate of that kind.
 *
 * What each evaluation feeds (TODO(kim-validar:A2), simulated answers):
 *
 *   evaluation                                        BASE (one voice)   CUPS + FLAGS
 *   descriptive format                                no                 no
 *   affective/combined, complete, 2+ cups per sample  yes                yes
 *   affective/combined, 1 cup per sample (quick)      NO (decision 4)    yes
 *   affective/combined, incomplete ratings            no                 yes
 *   reference sample, session in "anchor" mode        no                 no   (pinned, not an opinion)
 *   reference sample, session in "free" mode          as any other       as any other
 *
 * Privacy: the only thing that leaves this function is numbers. The input
 * carries an opaque per-coffee `cupperKey` (an index, never a profile id) so
 * `foundBy` can count DIFFERENT people; the output type has no key, id or name.
 */
import { SENSORY_DEFECTS, asSessionFormat, type SensoryDefect } from "@/lib/constants";
import { defectTally } from "@/lib/cupDefects";
import { isIndicativeByCups } from "@/lib/indicativeCups";
import { isQuickImpression } from "@/lib/historyRules";
import {
  calcCommunityScore,
  calcRawScore,
  cupDeduction,
  evaluationCupCounts,
  isAffectiveComplete,
} from "@/lib/scoring";

export interface LifetimeEvaluation {
  /** Opaque, stable only within one call: distinguishes cuppers, identifies nobody. */
  cupperKey: number;
  affectiveData: unknown;
  combinedData: unknown;
  nonUniformCups: readonly boolean[];
  defectiveCups: readonly boolean[];
  /** Evaluation.cups; NULL = scored before 2026-11 -> the session's cups per sample. */
  cups: number | null;
}

export interface LifetimeSample {
  sessionId: string;
  /** SessionSample.referenceRank (1..3) or null. */
  referenceRank: number | null;
  session: {
    format: string;
    cupsPerSample: number;
    /** "anchor" | "free" (anything but "free" reads as anchor, like the app does). */
    referenceMode: string | null;
  };
  evaluations: LifetimeEvaluation[];
}

export interface LifetimeTally {
  /** Defective cups by type; legacy/untyped ones are in `unspecified`. */
  byType: Record<SensoryDefect, number>;
  unspecified: number;
  /** Defective cups = Σ byType + unspecified. */
  defective: number;
  nonUniform: number;
  /** Share of defective cups among cups cupped, 0..100 with one decimal; null with no cups. */
  defectivePct: number | null;
  /** How many DIFFERENT cuppers flagged at least one defective cup. */
  foundBy: number;
}

/** Numbers only: no cupper id, key or name. */
export interface CoffeeLifetimeScore {
  /** Rounded to 0.25, clamped 0..100; null when no evaluation feeds the base. */
  score: number | null;
  /** Mean raw base of the evaluations that feed it (exact, not rounded); null with none. */
  base: number | null;
  /** Total deduction (uniformity + defects) over the pooled cups. */
  deduction: number;
  /** 5 / max(5, cups). */
  factor: number;
  /** Evaluations that feed the base (one voice each). */
  voices: number;
  /** Pooled cups that feed the deduction. */
  cups: number;
  /** Distinct sessions that fed cups. */
  sessions: number;
  /** Fewer than 5 pooled cups (owner's decision 7). */
  indicative: boolean;
  tally: LifetimeTally;
}

function moduleData(format: string, ev: LifetimeEvaluation): Record<string, unknown> {
  const raw = asSessionFormat(format) === "affective" ? ev.affectiveData : ev.combinedData;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

export function computeCoffeeLifetimeScore(samples: readonly LifetimeSample[]): CoffeeLifetimeScore {
  const byType = Object.fromEntries(SENSORY_DEFECTS.map((d) => [d, 0])) as Record<SensoryDefect, number>;
  let unspecified = 0;
  let totalCups = 0;
  let totalNonUniform = 0;
  let totalDefective = 0;
  let baseSum = 0;
  let voices = 0;
  const sessionsWithCups = new Set<string>();
  const finders = new Set<number>();

  for (const sample of samples) {
    const format = asSessionFormat(sample.session.format);
    if (format === "descriptive") continue;
    // An anchor-mode reference is pinned at 5 and its cup checks are cleared:
    // it is not an opinion about the coffee. Free mode scores it like any sample.
    if (sample.referenceRank !== null && sample.session.referenceMode !== "free") continue;
    const quick = isQuickImpression(sample.session.cupsPerSample);

    for (const ev of sample.evaluations) {
      const data = moduleData(format, ev);
      const cups = ev.cups ?? sample.session.cupsPerSample;
      const { u, d } = evaluationCupCounts(ev.nonUniformCups, ev.defectiveCups, cups);
      if (Number.isFinite(cups) && cups > 0) {
        totalCups += cups;
        sessionsWithCups.add(sample.sessionId);
      }
      totalNonUniform += u;
      totalDefective += d;

      if (d > 0) {
        finders.add(ev.cupperKey);
        const tally = defectTally(data, Math.max(0, Math.floor(cups)));
        const typedSum = SENSORY_DEFECTS.reduce((a, t) => a + tally.byType[t], 0);
        if (typedSum <= d) {
          for (const t of SENSORY_DEFECTS) byType[t] += tally.byType[t];
          unspecified += d - typedSum;
        } else {
          unspecified += d; // the data disagrees with the stored flags: the flags win
        }
      }

      if (!quick && isAffectiveComplete(data)) {
        baseSum += calcRawScore(data);
        voices += 1;
      }
    }
  }

  const base = voices > 0 ? baseSum / voices : null;
  const deduction = cupDeduction({ cups: totalCups, nonUniform: totalNonUniform, defective: totalDefective });
  const score =
    base === null
      ? null
      : calcCommunityScore({ avgRawScore: base, totalNonUniform, totalDefective, totalCups });

  return {
    score,
    base,
    deduction: deduction.total,
    factor: deduction.factor,
    voices,
    cups: totalCups,
    sessions: sessionsWithCups.size,
    indicative: isIndicativeByCups(totalCups),
    tally: {
      byType,
      unspecified,
      defective: totalDefective,
      nonUniform: totalNonUniform,
      defectivePct: totalCups > 0 ? Math.round((totalDefective / totalCups) * 1000) / 10 : null,
      foundBy: finders.size,
    },
  };
}
