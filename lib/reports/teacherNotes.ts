// Pure builder for the owner's "teacher notes": per cupper, how each score
// compares to the community, how well their descriptors line up with the group
// consensus, and which consensus descriptors they missed. OWNER-ONLY data —
// it carries cupper identity by design; never hand it to a participant route.

import { collectDescriptors, PERCEPTUAL_BLOCKS } from "@/lib/descriptors";
import { calcIndividualScore, hasAffectiveData } from "@/lib/scoring";
import { bandFor, rowStats, type Band } from "./cupperStats";
import { blobForFormat, type SessionReportSource } from "./types";

export type TeacherSampleNote = {
  sampleId: string;
  label: string;
  isReference: boolean;
  score: number | null;
  communityScore: number | null;
  /** score - communityScore, null when either side is missing. */
  delta: number | null;
  band: Band;
  alignment: { matches: number; opportunities: number; ratio: number | null } | null;
  /** Consensus descriptor ids (per block) the cupper did not pick. */
  missed: { blockId: string; ids: string[] }[];
  /** Cupper's own descriptor ids (per block) outside the consensus. */
  extra: { blockId: string; ids: string[] }[];
};

export type TeacherCupperNotes = {
  cupperId: string;
  name: string;
  excluded: boolean;
  alignment: { overall: number; matches: number; opportunities: number } | null;
  samples: TeacherSampleNote[];
};

export function buildTeacherNotes(src: SessionReportSource): TeacherCupperNotes[] {
  const { session } = src;
  const format = session.format;
  const excluded = new Set(src.excludedUserIds);

  const cuppers = new Map<string, string>();
  for (const e of src.evals) cuppers.set(e.cupperId, e.displayName);
  const ids = [...cuppers.keys()].sort((a, b) => cuppers.get(a)!.localeCompare(cuppers.get(b)!));

  const evalOf = (cupperId: string, sampleId: string) =>
    src.evals.find((e) => e.cupperId === cupperId && e.sessionSampleId === sampleId);

  const scoreOf = (cupperId: string, sampleId: string): number | null => {
    if (format === "descriptive") return null;
    const ev = evalOf(cupperId, sampleId);
    if (!ev) return null;
    const blob = blobForFormat(format, ev);
    if (!hasAffectiveData(blob)) return null;
    const sc = calcIndividualScore(blob, session.cupsPerSample);
    return typeof sc === "number" ? sc : null;
  };

  const included = ids.map((id) => !excluded.has(id));
  const statsBySample = new Map(
    src.samples.map((s) => [
      s.id,
      rowStats(
        ids.map((id) => scoreOf(id, s.id)),
        included,
      ),
    ]),
  );

  return ids.map((cupperId) => {
    const isExcluded = excluded.has(cupperId);
    const row = src.alignmentRows.find((r) => r.id === cupperId);

    const samples = src.samples.map((s): TeacherSampleNote => {
      const score = scoreOf(cupperId, s.id);
      const community = src.groupAggBySample[s.id]?.communityScore ?? null;
      const majority = src.majoritySets[s.id] ?? {};
      const ev = evalOf(cupperId, s.id);
      const blob = ev && format !== "affective" ? blobForFormat(format, ev) : null;

      const missed: TeacherSampleNote["missed"] = [];
      const extra: TeacherSampleNote["extra"] = [];
      if (blob) {
        for (const block of PERCEPTUAL_BLOCKS) {
          const maj = new Set(majority[block.id] ?? []);
          const own = new Set(collectDescriptors(blob, block.descKeys));
          const miss = [...maj].filter((d) => !own.has(d));
          const out = maj.size > 0 ? [...own].filter((d) => !maj.has(d)) : [];
          if (miss.length) missed.push({ blockId: block.id, ids: miss });
          if (out.length) extra.push({ blockId: block.id, ids: out });
        }
      }

      const bs = row?.bySample[s.id];
      return {
        sampleId: s.id,
        label: s.label,
        isReference: s.isReference,
        score,
        communityScore: community,
        delta: score !== null && community !== null ? score - community : null,
        band: isExcluded ? "neutral" : bandFor(score, statsBySample.get(s.id)!),
        alignment: bs
          ? {
              matches: bs.matches,
              opportunities: bs.opportunities,
              ratio: bs.opportunities > 0 ? bs.matches / bs.opportunities : null,
            }
          : null,
        missed,
        extra,
      };
    });

    return {
      cupperId,
      name: cuppers.get(cupperId)!,
      excluded: isExcluded,
      alignment: row
        ? { overall: row.alignment, matches: row.matches, opportunities: row.opportunities }
        : null,
      samples,
    };
  });
}
