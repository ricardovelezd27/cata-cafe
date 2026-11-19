import { describe, expect, it } from "vitest";
import { readSource as read } from "./helpers/sourceTree";

// Q1 (audit B-06, H-10, D-13, J-06, A-04): the list kit's semantics and numbers,
// pinned in the source so a later edit cannot quietly drop them.

const table = read("components/ui/DataTable.tsx");

describe("Q1: DataTable names its rows, columns and itself", () => {
  it("H-10: every table has a visually hidden caption, and the caption is required", () => {
    expect(table).toMatch(/<caption className="sr-only">\{translations\.caption\}<\/caption>/);
    expect(table).toMatch(/\n\s+caption: string;/);
  });

  it("H-10: the first column of a row is its row header", () => {
    expect(table).toMatch(/ci === 0 \? \(\s*<th key=\{col\.key\} scope="row"/);
  });

  it("H-10: the actions column has a visually hidden name", () => {
    expect(table).toMatch(/<span className="sr-only">\{translations\.actions\}<\/span>/);
  });

  it("B-06: a numeric column is right-aligned and in tabular figures, header included", () => {
    expect(table).toMatch(/numeric\?: boolean;/);
    expect(table).toMatch(/align=\{col\.align \?\? \(col\.numeric \? "right" : undefined\)\}/);
    expect(table).toMatch(/col\.numeric \? "tabular-nums" : ""/);
  });

  it("B-06: the number columns of the four lists are numeric", () => {
    const numericKeys: [string, string[]][] = [
      ["components/coffees/CoffeesTable.tsx", ["sessions", "score"]],
      ["app/[locale]/app/sessions/SessionsTable.tsx", ["samples", "participants"]],
      ["app/[locale]/app/profile/history/HistoryTable.tsx", ["individualScore", "communityScore"]],
      ["components/insights/UsersDirectory.tsx", ["sessionsCount", "coffeesCount"]],
    ];
    for (const [file, keys] of numericKeys) {
      const src = read(file);
      for (const k of keys) {
        expect(src, `${file} ${k}`).toMatch(new RegExp(`key: "${k}",[^}]*numeric: true`));
      }
    }
  });
});

describe("Q1: the rest of the package", () => {
  it("A-04: a stat card's numeral is ink, and the card has no `accent` to single one out", () => {
    const card = read("components/dashboard/StatCard.tsx");
    expect(card).toMatch(/className="font-display text-4xl leading-none mt-1 tabular-nums text-on-surface"/);
    expect(card).not.toMatch(/text-secondary/);
    expect(card).not.toMatch(/accent/);
    expect(read("components/profile/LevelBadge.tsx")).not.toMatch(/text-secondary/);
  });

  it("D-13: the sessions phone card is one link, its actions sit above the link's layer", () => {
    const src = read("app/[locale]/app/sessions/SessionsTable.tsx");
    expect(src).toMatch(/after:absolute after:inset-0/);
    expect(src).toMatch(/relative z-10 flex shrink-0 items-center gap-1">\{actions\}/);
  });

  it("J-06: the explorer's load is guarded and offers a retry", () => {
    const src = read("components/insights/ExplorerBuilder.tsx");
    expect(src).toMatch(/try \{\s*const result = await runInsight\(config, locale\);/);
    expect(src).toMatch(/\} catch \{\s*setError\(true\);/);
    expect(src).toMatch(/<Notice\s+tone="error"/);
  });

  it("J-03: the results and cupping routes have their own skeletons", () => {
    expect(read("app/[locale]/app/sessions/[id]/results/loading.tsx")).toMatch(/export default async function ResultsLoading/);
    expect(read("app/[locale]/app/sessions/[id]/cup/loading.tsx")).toMatch(/export default async function CupLoading/);
  });
});
