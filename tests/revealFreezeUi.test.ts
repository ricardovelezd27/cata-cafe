import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isEvaluationReadOnly, isModuleFrozenForRevealed } from "@/lib/revealFreeze";
import { scorePillClasses } from "@/lib/scorePillClass";
import { pinWouldTouchRevealed } from "@/lib/referenceRules";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScorePill } from "@/components/ui/Badge";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("isModuleFrozenForRevealed (H2)", () => {
  it("refuses a module change on a revealed sample", () => {
    for (const key of ["descriptive", "affective", "combined"]) {
      expect(isModuleFrozenForRevealed({ revealed: true, key })).toBe(true);
    }
  });
  it("accepts the owner's extrinsic and physical changes on a revealed sample", () => {
    expect(isModuleFrozenForRevealed({ revealed: true, key: "extrinsic" })).toBe(false);
    expect(isModuleFrozenForRevealed({ revealed: true, key: "physical" })).toBe(false);
  });
  it("never freezes a blind sample", () => {
    for (const key of ["descriptive", "affective", "combined", "extrinsic", "physical"]) {
      expect(isModuleFrozenForRevealed({ revealed: false, key })).toBe(false);
    }
  });
  it("only the cupping tab renders read-only", () => {
    expect(isEvaluationReadOnly({ revealed: true, activeTab: "cupping" })).toBe(true);
    expect(isEvaluationReadOnly({ revealed: true, activeTab: "extrinsic" })).toBe(false);
    expect(isEvaluationReadOnly({ revealed: true, activeTab: "physical" })).toBe(false);
    expect(isEvaluationReadOnly({ revealed: false, activeTab: "cupping" })).toBe(false);
  });
  it("CupClient drives setSampleData and the fieldset from these functions", () => {
    const src = read("app", "[locale]", "app", "sessions", "[id]", "cup", "CupClient.tsx");
    expect(src).toMatch(/isModuleFrozenForRevealed\(\{ revealed: sample\.revealed, key: String\(key\) \}\)/);
    expect(src).toMatch(/disabled=\{isEvaluationReadOnly\(\{ revealed: isCurrentRevealed, activeTab \}\)\}/);
  });
});

describe("quick notes step on a revealed sample (round 3)", () => {
  it("the note lives in the evaluation module, so a revealed sample is read-only there", () => {
    for (const key of ["descriptive", "affective", "combined"]) {
      expect(isModuleFrozenForRevealed({ revealed: true, key })).toBe(true);
      expect(isModuleFrozenForRevealed({ revealed: false, key })).toBe(false);
    }
  });
  it("CupClient hands the decision to the step and the step disables the textarea", () => {
    const cup = read("app", "[locale]", "app", "sessions", "[id]", "cup", "CupClient.tsx");
    expect(cup).toMatch(/readOnly: isModuleFrozenForRevealed\(\{ revealed: s\.revealed, key: notesModuleKey \}\)/);
    const step = read("components", "cupping", "ExpressNotesStep.tsx");
    expect(step).toMatch(/<fieldset disabled=\{s\.readOnly === true\}/);
  });
});

describe("scorePillClasses (A10)", () => {
  it("takes no score and names no quality token", () => {
    expect(scorePillClasses.length).toBe(0);
    const cls = scorePillClasses();
    expect(cls).not.toMatch(/primary-container|secondary|error|green|amber|red|warning/);
    expect(scorePillClasses()).toBe(cls);
  });
  it("ScorePill uses it and passes nothing derived from the score", () => {
    const src = read("components", "ui", "Badge.tsx");
    expect(src).toMatch(/className=\{scorePillClasses\(\)\}/);
  });
  it("ScorePill renders identical markup for 60, 79 and 95 apart from the number (no style or class from the score)", () => {
    // S10 WP6 C4: a colour set through `style` (not `className`) must fail too.
    const html = (score: number) => renderToStaticMarkup(createElement(ScorePill, { score }));
    const stripNumber = (h: string, score: number) => h.replace(score.toFixed(2), "#");
    const [a, b, c] = [60, 79, 95].map((n) => stripNumber(html(n), n));
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).not.toMatch(/style=/);
    expect(a).toContain("#");
  });
});

describe("pinWouldTouchRevealed (H1)", () => {
  const base = { mode: "anchor", moduleKey: "affective", overwrites: 2 };
  it("refuses pinning a revealed sample in anchor mode when it would rewrite ratings", () => {
    expect(pinWouldTouchRevealed({ ...base, targetRevealed: true })).toBe(true);
    expect(pinWouldTouchRevealed({ ...base, moduleKey: "combined", targetRevealed: true })).toBe(true);
  });
  it("proceeds when the pin would rewrite nothing (round 3)", () => {
    expect(pinWouldTouchRevealed({ ...base, overwrites: 0, targetRevealed: true })).toBe(false);
  });
  it("allows a blind sample, free mode and descriptive-only sessions", () => {
    expect(pinWouldTouchRevealed({ ...base, targetRevealed: false })).toBe(false);
    expect(pinWouldTouchRevealed({ mode: "free", moduleKey: "affective", targetRevealed: true, overwrites: 3 })).toBe(false);
    expect(pinWouldTouchRevealed({ mode: "anchor", moduleKey: "descriptive", targetRevealed: true, overwrites: 3 })).toBe(false);
  });
  it("an unknown mode reads as anchor (fail closed)", () => {
    expect(pinWouldTouchRevealed({ mode: "weird", moduleKey: "affective", targetRevealed: true, overwrites: 3 })).toBe(true);
  });
});
