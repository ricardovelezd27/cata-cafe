// Pure builder for the OWNER's raw results export (S8-12, F-informes-7): one row
// per submitted evaluation (cupper x sample) so a lab can re-analyse the panel
// in a spreadsheet. OWNER ONLY — the route gates it like the ficha tecnica. It
// carries cupper identities, so participants never get it.
//
// S10 WP5a (D5, TODO(kim-validar:D5)): every row carries a stable code per cupper
// ("C01", "C02"…, ordered by the participant row's creation, never by name). The
// default export has the name AND the code; `names: false` drops the name column
// (the code stays) so the file can be shared without identifying anyone: no
// display name, id or email, and the free text of an "other" exclusion reason
// (which could name someone) is reduced to the bare code "other".

import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { calcIndividualScore, evaluationCupCounts, hasAffectiveData } from "@/lib/scoring";
import { evaluationScoreRule } from "@/lib/scoreRule";
import { coffeeDisplayName } from "@/lib/coffeeAnonymize";
import { CSV_BOM, csvRow } from "@/lib/csv";
import { blobForFormat, type ReportLocale, type SessionReportSource } from "./types";

const HEADERS = {
  es: {
    cupper: "catador",
    code: "codigo",
    sample: "muestra",
    reference: "referencia",
    coffee: "cafe",
    excluded: "excluido",
    reason: "motivo_exclusion",
    nonUniform: "tazas_no_uniformes",
    defective: "tazas_defectuosas",
    score: "puntaje_cva",
    yes: "si",
    no: "no",
  },
  en: {
    cupper: "cupper",
    code: "code",
    sample: "sample",
    reference: "reference",
    coffee: "coffee",
    excluded: "excluded",
    reason: "exclusion_reason",
    nonUniform: "non_uniform_cups",
    defective: "defective_cups",
    score: "cva_score",
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
  opts: {
    locale: ReportLocale;
    coffeeDeleted: string;
    names?: boolean;
    /** cupper id -> keyed code for THIS session (lib/reports/csvCodeKey.ts, tests build it by hand). */
    codes: ReadonlyMap<string, string>;
  },
): { csv: string; rows: number } {
  const withNames = opts.names !== false;
  const h = HEADERS[opts.locale];
  const excluded = new Set(src.excludedUserIds);
  const reasonByUser = new Map(src.participants.map((p) => [p.userId, p.exclusionReason ?? ""]));
  const codeById = opts.codes;
  const codeOf = (id: string) => codeById.get(id) ?? "";

  const header = csvRow([
    ...(withNames ? [h.cupper] : []),
    h.code,
    h.sample,
    h.reference,
    h.coffee,
    h.excluded,
    // The shareable file has no reason column at all: even the code of a reason says something.
    ...(withNames ? [h.reason] : []),
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
      .sort((a, b) => {
        // Never by name, id or join time: by the keyed code (review H1).
        const ca = codeOf(a.cupperId);
        const cb = codeOf(b.cupperId);
        return ca < cb ? -1 : ca > cb ? 1 : 0;
      });
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
          ...(withNames ? [ev.displayName] : []),
          codeOf(ev.cupperId),
          sample.label,
          sample.isReference ? (sample.referenceRank ?? 1) : "",
          coffee,
          isExcluded ? h.yes : h.no,
          ...(withNames ? [isExcluded ? (reasonByUser.get(ev.cupperId) ?? "") : ""] : []),
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
