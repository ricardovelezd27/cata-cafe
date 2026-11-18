import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countRecipes } from "../scripts/ux-recipes/count.mjs";

// Package P2d / P3a: the results page takes the kit (Notice, Card,
// PaperSectionHeading, TextAction, Badge). Frames only: every notice keeps the
// condition that decides who sees it, and nothing on the server changed.

const RESULTS_ROUTE = "app/[locale]/app/sessions/[id]/results";
const files = [
  ...readdirSync(RESULTS_ROUTE).filter((f) => f.endsWith(".tsx")).map((f) => join(RESULTS_ROUTE, f)),
  ...readdirSync("components/results").filter((f) => f.endsWith(".tsx")).map((f) => join("components/results", f)),
];
const src = (p: string) => readFileSync(p, "utf8");

describe("the results page uses the kit", () => {
  it("has no terracotta banner left (the accent is not a notice colour)", () => {
    for (const f of files) expect(src(f), f).not.toMatch(/bg-secondary-container\/20|border-secondary\/30/);
  });

  it("the recipe counter's results row: no hand-written card, banner or framed notice", () => {
    const { table } = countRecipes();
    const row = table.find((r: { area: string }) => r.area === "results");
    expect(row).toMatchObject({ card: 0, banner: 0, notice: 0 });
    // the two headings left are R2's own anatomy: a coffee card's title (CoffeeCards)
    // and an overview tile's title (SessionOverview)
    expect(row.heading).toBe(2);
  });

  it("every notice keeps the condition that decides who sees it", () => {
    const s = src(join(RESULTS_ROUTE, "ResultsClient.tsx"));
    for (const gate of [
      "{exclusionNotice && (",
      "{adminViewNotice && (",
      "{closedNotice && (",
      "{closeAsIs && showCloseAsIs && (",
      "{myLateNotices.map((line) => (",
      "{closeNow && (",
      "{myDraftNotice && (",
      "!isAdminViewer && cuppingOpen ? (",
      "{finishPlan?.canFinish && finish && (",
      '{partialSyncNotice && !(effectiveTab === "resumen" && overview.data.who) && (',
      "{coffeeNotOwnedNotice && (",
      "{guestSave && !isAdminViewer && (",
    ]) {
      expect(s, gate).toContain(gate);
    }
    expect((s.match(/<Notice\b/g) ?? []).length).toBe(9);
  });

  it("the late evaluations keep their confirm and version guard", () => {
    const s = src("components/results/LateEvaluationsPanel.tsx");
    expect(s).toContain("<ConfirmDialog");
    expect(s).toContain("acceptLateEvaluation(");
    expect(s).toContain("updatedAt");
  });
});
