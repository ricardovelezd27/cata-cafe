// Pure builder for the OWNER's raw results export (S8-12, F-informes-7): one row
// per submitted evaluation (cupper x sample) so a lab can re-analyse the panel
// in a spreadsheet. OWNER ONLY — the route gates it like the ficha tecnica. It
// carries cupper identities, so participants never get it.
//
// TODO(Kim-D5): the default exports NAMES; `codes: true` swaps them for stable
// anonymous codes (C1, C2…) when Kim prefers that.

import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { calcIndividualScore, evaluationCupCounts, hasAffectiveData } from "@/lib/scoring";
import { evaluationScoreRule } from "@/lib/scoreRule";
import { coffeeDisplayName } from "@/lib/coffeeAnonymize";
import { CSV_BOM, csvRow } from "@/lib/csv";
import { blobForFormat, type ReportLocale, type SessionReportSource } from "./types";

const HEADERS = {
  es: {
    cupper: "catador",
    sample: "muestra",
    reference: "referencia",
    coffee: "cafe",
    excluded: "excluido",
    reason: "motivo_exclusion",
    nonUniform: "tazas_no_uniformes",
    defective: "tazas_defectuosas",
    score: "puntaje_cafe_sensible",
    yes: "si",
    no: "no",
  },
  en: {
    cupper: "cupper",
    sample: "sample",
    reference: "reference",
    coffee: "coffee",
    excluded: "excluded",
    reason: "exclusion_reason",
    nonUniform: "non_uniform_cups",
    defective: "defective_cups",
    score: "cafe_sensible_score",
    yes: "yes",
    no: "no",
  },
} as const;

function attrValue(data: Record<string, unknown>, id: string): number | "" {
  const n = Number(data[`${id}_final`] ?? data[id] ?? 0);
  return Number.isFinite(n) && n > 0 ? n : "";
}

export function buildResultsCsv(
  src: SessionReportSource,
  opts: { locale: ReportLocale; coffeeDeleted: string; codes?: boolean },
): { csv: string; rows: number } {
  const h = HEADERS[opts.locale];
  const excluded = new Set(src.excludedUserIds);
  const reasonByUser = new Map(src.participants.map((p) => [p.userId, p.exclusionReason ?? ""]));

  // Stable anonymous codes in first-seen cupper order (by name for determinism).
  const cuppers = [...new Map(src.evals.map((e) => [e.cupperId, e.displayName])).entries()].sort(
    (a, b) => a[1].localeCompare(b[1]),
  );
  const codeById = new Map(cuppers.map(([id], i) => [id, `C${i + 1}`]));

  const header = csvRow([
    h.cupper,
    h.sample,
    h.reference,
    h.coffee,
    h.excluded,
    h.reason,
    ...AFFECTIVE_ATTRIBUTES.map((a) => a.label),
    h.nonUniform,
    h.defective,
    h.score,
  ]);

  const lines: string[] = [header];
  let rows = 0;
  for (const sample of src.samples) {
    // Coffee name only once revealed — the export never breaks a blind tasting.
    const coffee =
      sample.revealed && sample.coffee
        ? coffeeDisplayName(sample.coffee, opts.coffeeDeleted)
        : "";
    const evals = src.evals
      .filter((e) => e.sessionSampleId === sample.id)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    for (const ev of evals) {
      const blob = blobForFormat(src.session.format, ev);
      const scored = src.session.format !== "descriptive" && hasAffectiveData(blob);
      // cups NULL = scored before the 2026-11 rule: v1 arithmetic, raw flag counts
      const rule = evaluationScoreRule(ev.cups, true);
      const cups = ev.cups ?? src.session.cupsPerSample;
      const evalCupCounts =
        rule === "v1"
          ? { u: ev.nonUniformCups.filter(Boolean).length, d: ev.defectiveCups.filter(Boolean).length }
          : evaluationCupCounts(ev.nonUniformCups, ev.defectiveCups, cups);
      const score = scored ? calcIndividualScore(blob, cups, { rule }) : "";
      const isExcluded = excluded.has(ev.cupperId);
      lines.push(
        csvRow([
          opts.codes ? (codeById.get(ev.cupperId) ?? "") : ev.displayName,
          sample.label,
          sample.isReference ? (sample.referenceRank ?? 1) : "",
          coffee,
          isExcluded ? h.yes : h.no,
          isExcluded ? (reasonByUser.get(ev.cupperId) ?? "") : "",
          ...AFFECTIVE_ATTRIBUTES.map((a) => (scored ? attrValue(blob, a.id) : "")),
          evalCupCounts.u,
          evalCupCounts.d,
          typeof score === "number" ? score.toFixed(2) : "",
        ]),
      );
      rows++;
    }
  }
  return { csv: CSV_BOM + lines.join("\n") + "\n", rows };
}
