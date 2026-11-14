// S10 WP6 C1: when a solo "Terminar cata" cannot finish because of revealed samples,
// the owner is offered "Cerrar la cata" (the existing owner close).
import { describe, expect, it } from "vitest";
import { planFinish, soloCloseAsIsOffer } from "@/lib/closeRules";

describe("soloCloseAsIsOffer", () => {
  it("offers it when the finish is impossible and a revealed sample is unfinished", () => {
    expect(
      soloCloseAsIsOffer({
        canFinish: false,
        samples: [
          { revealed: true, submitted: false },
          { revealed: false, submitted: true },
        ],
      }),
    ).toBe(true);
  });
  it("does not offer it when 'Terminar cata' works", () => {
    expect(
      soloCloseAsIsOffer({ canFinish: true, samples: [{ revealed: true, submitted: false }] }),
    ).toBe(false);
  });
  it("does not offer it when no unfinished sample is revealed (the owner can still cup)", () => {
    expect(
      soloCloseAsIsOffer({
        canFinish: false,
        samples: [
          { revealed: false, submitted: false },
          { revealed: true, submitted: true },
        ],
      }),
    ).toBe(false);
    expect(soloCloseAsIsOffer({ canFinish: false, samples: [] })).toBe(false);
  });
  it("does NOT offer it while an unrevealed sample could still be scored (fix round 4c)", () => {
    expect(
      soloCloseAsIsOffer({
        canFinish: false,
        samples: [
          { revealed: true, submitted: false },
          { revealed: false, submitted: false },
        ],
      }),
    ).toBe(false);
  });
  it("an unrevealed reference does not count as something still to score; a submitted unrevealed sample neither", () => {
    expect(
      soloCloseAsIsOffer({
        canFinish: false,
        samples: [
          { revealed: true, submitted: false },
          { revealed: false, submitted: false, isReference: true },
          { revealed: false, submitted: true },
        ],
      }),
    ).toBe(true);
  });
  it("matches planFinish: every non-reference sample unscored, some revealed", () => {
    const plan = planFinish([
      { id: "ref", isReference: true, evaluation: { isDraft: true, complete: true } },
      { id: "a", evaluation: null },
      { id: "b", evaluation: { isDraft: true, complete: false } },
    ]);
    expect(plan.canFinish).toBe(false);
    expect(
      soloCloseAsIsOffer({
        canFinish: plan.canFinish,
        samples: [
          { revealed: false, submitted: false, isReference: true },
          { revealed: true, submitted: false },
          { revealed: true, submitted: false },
        ],
      }),
    ).toBe(true);
  });
});
