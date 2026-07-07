/**
 * Pure, dependency-free statistical summary of per-sample block frequencies
 * (N15, Step 3). No LLM, no JSX, no i18n framework — just template-based
 * sentence assembly from real aggregation data. Imported by the results server
 * component today and reused by a later email/PDF task, so it must stay pure and
 * safely importable server-side.
 *
 * Convention chosen (applied consistently in es + en):
 *   - A descriptor is a "majority" finding when it was selected by >= 50% of the
 *     block's evaluators (`total`). Those get the "la mayoría (X de N)" framing
 *     with a rounded percentage.
 *   - When no descriptor reaches 50%, we fall back to the top 2-3 most-mentioned
 *     ("Los descriptores más mencionados … fueron: a, b, c").
 *   - We ALWAYS show both an integer percentage and the exact "X de N" count, so
 *     the phrasing reads well whether N is small or large.
 */

/** One aggregated descriptor within a block (already counted across cuppers). */
export type SummaryDescriptor = {
  id: string;
  label: string;
  count: number;
};

/** One perceptual block's aggregation for a single sample. */
export type SummaryBlock = {
  /** Stable block id (nariz | boca | gusto | acidez | dulzura | sensacion). */
  id: string;
  /** Localized block heading, e.g. "Nariz" / "Nose". */
  label: string;
  /** Descriptors sorted desc by count (caller's responsibility). */
  descriptors: SummaryDescriptor[];
  /** Evaluators who contributed to THIS block for THIS sample. */
  total: number;
};

/** A rendered sentence for one block (or null when the block had no data). */
export type BlockSentence = {
  blockId: string;
  /** null → render the caller's empty state instead of a sentence. */
  text: string | null;
};

type Locale = "es" | "en";

const MAJORITY_THRESHOLD = 0.5;
const FALLBACK_TOP_N = 3;

/** Join a list with locale-appropriate commas + final conjunction. */
function joinList(items: string[], locale: Locale): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  const conj = locale === "en" ? "and" : "y";
  const head = items.slice(0, -1).join(", ");
  const tail = items[items.length - 1];
  return `${head} ${conj} ${tail}`;
}

function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

/**
 * Build one natural-language sentence for a single block from its frequency
 * data. Returns `null` text when the block has no evaluators or no descriptors,
 * signalling the caller to render an explicit empty state (Step 1: blocks never
 * silently vanish).
 */
export function summarizeBlock(block: SummaryBlock, locale: Locale): BlockSentence {
  const { descriptors, total, label } = block;
  if (total <= 0 || descriptors.length === 0) {
    return { blockId: block.id, text: null };
  }

  const majority = descriptors.filter((d) => d.count / total >= MAJORITY_THRESHOLD);

  if (majority.length > 0) {
    // Majority descriptors can have DIFFERENT counts (e.g. 4/4 chocolate +
    // 2/4 caramelo). Leading with the top count would overstate agreement for
    // the lesser ones, so frame with the MINIMUM count among the listed
    // descriptors ("Al menos el X%…"). When every listed count is equal, keep
    // the exact "El X%…" phrasing since no overstatement is possible.
    const labels = majority.map((d) => d.label);
    const counts = majority.map((d) => d.count);
    const minCount = Math.min(...counts);
    const allEqual = counts.every((c) => c === minCount);
    const p = pct(minCount, total);
    const list = joinList(labels, locale);
    if (locale === "en") {
      const lead = allEqual
        ? `${p}% of cuppers (${minCount} of ${total})`
        : `At least ${p}% of cuppers (${minCount} of ${total})`;
      return {
        blockId: block.id,
        text: `${lead} found in ${label.toLowerCase()}: ${list}.`,
      };
    }
    const lead = allEqual
      ? `El ${p}% de los catadores (${minCount} de ${total})`
      : `Al menos el ${p}% de los catadores (${minCount} de ${total})`;
    return {
      blockId: block.id,
      text: `${lead} encontró en ${label.toLowerCase()}: ${list}.`,
    };
  }

  // Fallback: no majority — surface the most-mentioned few.
  const topFew = descriptors.slice(0, FALLBACK_TOP_N).map((d) => d.label);
  const list = joinList(topFew, locale);
  if (locale === "en") {
    return {
      blockId: block.id,
      text: `The most-mentioned descriptors in ${label.toLowerCase()} were: ${list}.`,
    };
  }
  return {
    blockId: block.id,
    text: `Los descriptores más mencionados en ${label.toLowerCase()} fueron: ${list}.`,
  };
}

/**
 * Summarize every block of a sample. Preserves input block order so the caller
 * can render Nariz / Boca / Gusto / Acidez / Dulzura / Sensación consistently.
 */
export function summarizeSample(
  blocks: SummaryBlock[],
  locale: Locale
): BlockSentence[] {
  return blocks.map((b) => summarizeBlock(b, locale));
}
