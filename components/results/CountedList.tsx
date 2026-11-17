import { fillPattern } from "@/lib/fillPattern";
import type { CountedNode } from "@/lib/flavorWheel";
import { CountBar } from "@/components/ui/CountBar";
import styles from "./CountedList.module.css";

export type CountedListStrings = {
  /** "{count} de {n}" */
  countOf: string;
  /** What the ring around a dot means: "elegido por ti" */
  chosenByYou: string;
  /** Shown instead of the list when nobody picked anything: "Nadie eligió un sabor." */
  nobody: string;
};

/** "Alcohol/Fermentado" may break after its slash, never inside a word. */
function softBreak(name: string): string {
  return name.replace(/\//g, "/\u200b");
}

/**
 * The counted list that always sits under a full wheel: one row per family or
 * per descriptor, "Frutos rojos ▬▬▬ 6 de 7". It is the wheel's text equivalent
 * and the exact reading, so it is a real list, not a picture.
 *
 * `items` come from `countedFamilies` / `countedDescriptors` (lib/flavorWheel.ts),
 * already counted, ordered and cut: this component only prints them. `marked`
 * holds the ids the reader chose; a marked row gets a ring, and the legend under
 * the list says what the ring means.
 */
export function CountedList({
  items,
  labels,
  strings,
  marked,
  maxRows,
  ariaLabel,
}: {
  items: readonly CountedNode[];
  /** id (a wheel node) -> its name in the reader's language. */
  labels: Readonly<Record<string, string>>;
  strings: CountedListStrings;
  marked?: readonly string[];
  maxRows?: number;
  ariaLabel?: string;
}) {
  const rows = typeof maxRows === "number" ? items.slice(0, maxRows) : items;
  if (rows.length === 0) return <p className={styles.empty}>{strings.nobody}</p>;
  const markedIds = new Set(marked ?? []);
  const anyMarked = rows.some((row) => markedIds.has(row.id));
  return (
    <div>
      <ul className={styles.list} aria-label={ariaLabel}>
        {rows.map((row) => (
          <CountBar
            key={row.id}
            as="li"
            label={softBreak(labels[row.id] ?? row.id)}
            bar={row.bar}
            valueText={fillPattern(strings.countOf, { count: row.bar.count, n: row.bar.n })}
            family={row.family}
            marked={markedIds.has(row.id)}
            markText={strings.chosenByYou}
          />
        ))}
      </ul>
      {anyMarked ? (
        <p className={styles.legend}>
          <span className={styles.ring} aria-hidden="true" />
          {strings.chosenByYou}
        </p>
      ) : null}
    </div>
  );
}
