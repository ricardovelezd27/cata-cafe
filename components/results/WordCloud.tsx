"use client";

import type { CloudWord } from "@/lib/wordCloud";

const MIN_FONT_PX = 13;
const MAX_FONT_PX = 34;
const DEFAULT_MAX_WORDS = 40;

/**
 * True size-scaled word cloud (no pill backgrounds — words are colored text,
 * sized by relative frequency). Font size is interpolated on a sqrt scale
 * between MIN_FONT_PX and MAX_FONT_PX so a handful of dominant descriptors
 * don't visually drown out the rest linearly.
 */
export function WordCloud({
  words,
  maxWords = DEFAULT_MAX_WORDS,
  emptyLabel,
}: {
  words: CloudWord[];
  maxWords?: number;
  emptyLabel: string;
}) {
  if (words.length === 0) {
    return <p className="text-sm text-on-surface-variant italic py-2">{emptyLabel}</p>;
  }

  const shown = words.slice(0, maxWords);
  const maxCount = Math.max(...shown.map((w) => w.count));
  const minCount = Math.min(...shown.map((w) => w.count));
  const allEqual = maxCount === minCount;

  const sizeFor = (count: number): number => {
    if (allEqual) return (MIN_FONT_PX + MAX_FONT_PX) / 2;
    // sqrt scale: differences among small counts still read as visually
    // distinct without letting one outlier dominate the whole cloud.
    const t = Math.sqrt((count - minCount) / (maxCount - minCount));
    return MIN_FONT_PX + t * (MAX_FONT_PX - MIN_FONT_PX);
  };

  return (
    <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-2 py-2">
      {shown.map((word) => {
        const fontSize = sizeFor(word.count);
        const isTop = !allEqual && word.count === maxCount;
        return (
          <span
            key={word.id}
            title={`${word.label} (${word.count})`}
            style={{
              fontSize,
              color: word.color,
              fontWeight: isTop ? 700 : fontSize > (MIN_FONT_PX + MAX_FONT_PX) / 2 ? 600 : 500,
              lineHeight: 1.15,
              whiteSpace: "nowrap",
              cursor: "default",
            }}
          >
            {word.label}
          </span>
        );
      })}
    </div>
  );
}
