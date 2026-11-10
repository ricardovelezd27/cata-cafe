import { describe, it, expect } from "vitest";
import {
  filterCoffeeSamples,
  type RawCoffeeSample,
  type CoffeeViewer,
} from "@/lib/coffees/filterCoffeeSamples";
import { computeCoffeeAggregate } from "@/lib/coffeeAggregate";

const OWNER = "owner";
const JOINED = "joined";
const STRANGER = "stranger";
const EXCLUDED = "excluded";

function sample(over: Partial<RawCoffeeSample> = {}, status = "closed"): RawCoffeeSample {
  return {
    id: "smp1",
    sessionId: "s1",
    revealed: true,
    session: {
      id: "s1",
      name: "Cata secreta",
      date: new Date("2026-10-01"),
      status,
      createdBy: OWNER,
      participants: [
        { userId: OWNER, excludedFromResults: false },
        { userId: JOINED, excludedFromResults: false },
        { userId: EXCLUDED, excludedFromResults: true },
      ],
    },
    aggregateScore: { communityScore: 84, participantCount: 2, attrAverages: {} },
    evaluations: [
      ev(OWNER, 85, "2026-10-01T10:00:00Z"),
      ev(JOINED, 83, "2026-10-01T11:00:00Z"),
      ev(EXCLUDED, 60, "2026-10-01T12:00:00Z"),
    ],
    ...over,
  };
}

function ev(cupperId: string, individualScore: number, at: string) {
  return {
    cupperId,
    descriptiveData: {},
    combinedData: {},
    individualScore,
    submittedAt: new Date(at),
  };
}

const viewer = (userId: string, isAdmin = false): CoffeeViewer => ({ userId, isAdmin });

describe("filterCoffeeSamples (S8-02, D6)", () => {
  it("drops open-session samples and keeps closed ones", () => {
    expect(filterCoffeeSamples([sample({}, "active")], viewer(OWNER))).toEqual([]);
    expect(filterCoffeeSamples([sample({}, "draft")], viewer(OWNER))).toEqual([]);
    expect(filterCoffeeSamples([sample()], viewer(OWNER))).toHaveLength(1);
  });

  it("drops closed-but-unrevealed samples", () => {
    expect(filterCoffeeSamples([sample({ revealed: false })], viewer(OWNER))).toEqual([]);
  });

  it("removes excluded cuppers before counting", () => {
    const [out] = filterCoffeeSamples([sample()], viewer(OWNER));
    expect(out.evaluations).toHaveLength(2);
    const agg = computeCoffeeAggregate([out]);
    expect(agg.evaluationsCount).toBe(2);
    expect(agg.individualAvg).toBe(84);
  });

  it("drops a sample that only has excluded evaluations", () => {
    const only = sample({ evaluations: [ev(EXCLUDED, 60, "2026-10-01T12:00:00Z")] });
    expect(filterCoffeeSamples([only], viewer(OWNER))).toEqual([]);
  });

  it("shows session name/date to owner, participant and admin, hides from strangers", () => {
    for (const v of [viewer(OWNER), viewer(JOINED), viewer("someone", true)]) {
      const [out] = filterCoffeeSamples([sample()], v);
      expect(out.session.name).toBe("Cata secreta");
      expect(out.session.date).toEqual(new Date("2026-10-01"));
    }
    const [hidden] = filterCoffeeSamples([sample()], viewer(STRANGER));
    expect(hidden.session.name).toBeNull();
    expect(hidden.session.date).toBeNull();
    // ...but the stranger's row still feeds the anonymous totals
    expect(hidden.evaluations).toHaveLength(2);
    expect(hidden.aggregateScore?.communityScore).toBe(84);
  });

  it("an excluded participant still knows the session name but their evaluation is out", () => {
    const [out] = filterCoffeeSamples([sample()], viewer(EXCLUDED));
    expect(out.session.name).toBe("Cata secreta");
    expect(out.evaluations).toHaveLength(2);
  });

  it("lists individual scores for own evaluations, or every one in an owned session", () => {
    const [asJoined] = filterCoffeeSamples([sample()], viewer(JOINED));
    expect(asJoined.evaluations.map((e) => e.visibleIndividually)).toEqual([false, true]);
    const [asOwner] = filterCoffeeSamples([sample()], viewer(OWNER));
    expect(asOwner.evaluations.every((e) => e.visibleIndividually)).toBe(true);
    const [asAdmin] = filterCoffeeSamples([sample()], viewer("x", true));
    expect(asAdmin.evaluations.every((e) => e.visibleIndividually)).toBe(true);
    const [asStranger] = filterCoffeeSamples([sample()], viewer(STRANGER));
    expect(asStranger.evaluations.some((e) => e.visibleIndividually)).toBe(false);
  });

  it("never passes the cupper id on", () => {
    const [out] = filterCoffeeSamples([sample()], viewer(OWNER));
    expect(JSON.stringify(out)).not.toContain("cupperId");
    expect(JSON.stringify(out)).not.toContain(JOINED);
  });

  it("passes aggregateScore through untouched and does not mutate the input", () => {
    const raw = [sample()];
    const copy = structuredClone(raw);
    const [out] = filterCoffeeSamples(raw, viewer(OWNER));
    expect(out.aggregateScore).toBe(raw[0].aggregateScore);
    expect(raw).toEqual(copy);
    expect(filterCoffeeSamples([], viewer(OWNER))).toEqual([]);
  });

  it("an open session never moves the profile average; closing does", () => {
    const closed = sample({ id: "a", sessionId: "s1" });
    const open = sample(
      {
        id: "b",
        sessionId: "s2",
        aggregateScore: { communityScore: 50, participantCount: 2, attrAverages: {} },
      },
      "active",
    );
    const before = computeCoffeeAggregate(filterCoffeeSamples([closed, open], viewer(OWNER)));
    expect(before.communityAvg).toBe(84);
    const after = computeCoffeeAggregate(
      filterCoffeeSamples([closed, { ...open, session: { ...open.session, status: "closed" } }], viewer(OWNER)),
    );
    expect(after.communityAvg).toBe(67);
  });
});
