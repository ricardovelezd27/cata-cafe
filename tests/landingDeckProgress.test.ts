import { describe, expect, it } from "vitest";
import {
  DECK,
  deckActive,
  deckBehind,
  deckEntries,
  deckFoldOffset,
  deckTrackProgress,
  pileFit,
} from "@/components/landing/deckProgress";

describe("deckTrackProgress", () => {
  const travel = 400;

  it("is 0 until the stage sticks and 1 once the track has run out", () => {
    expect(deckTrackProgress(500, travel)).toBe(0);
    expect(deckTrackProgress(DECK.stickTop, travel)).toBe(0);
    expect(deckTrackProgress(DECK.stickTop - travel, travel)).toBe(1);
    expect(deckTrackProgress(-5000, travel)).toBe(1);
  });

  it("moves in step with the scroll in between", () => {
    expect(deckTrackProgress(DECK.stickTop - 100, travel)).toBeCloseTo(0.25, 6);
    expect(deckTrackProgress(DECK.stickTop - 300, travel)).toBeCloseTo(0.75, 6);
  });

  it("answers 0 for a track with no travel or one that cannot be measured", () => {
    expect(deckTrackProgress(0, 0)).toBe(0);
    expect(deckTrackProgress(0, -20)).toBe(0);
    expect(deckTrackProgress(Number.NaN, travel)).toBe(0);
  });
});

describe("deckEntries", () => {
  it("the first card is always in; the others wait at the start", () => {
    expect(deckEntries(0, 5)).toEqual([1, 0, 0, 0, 0]);
  });

  it("every card is in at the end", () => {
    expect(deckEntries(1, 6)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("cards arrive one at a time, in order", () => {
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const e = deckEntries(t, 6);
      const moving = e.filter((v) => v > 0 && v < 1);
      expect(moving.length).toBeLessThanOrEqual(1);
      for (let i = 1; i < e.length; i++) expect(e[i]).toBeLessThanOrEqual(e[i - 1]);
    }
  });

  it("a card rests in place before the next one starts", () => {
    // Three cards: card 2 owns the first half of the track.
    const landed = (DECK.enter * 0.5) + 0.001;
    expect(deckEntries(landed, 3)[1]).toBe(1);
    expect(deckEntries(0.49, 3)).toEqual([1, 1, 0]);
  });

  it("never goes backwards as the track advances", () => {
    let prev = deckEntries(0, 4);
    for (let t = 0.005; t <= 1; t += 0.005) {
      const next = deckEntries(t, 4);
      next.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(prev[i] - 1e-9));
      prev = next;
    }
  });

  it("one card, or a progress that is not a number, is simply the first card", () => {
    expect(deckEntries(0.5, 1)).toEqual([1]);
    expect(deckEntries(Number.NaN, 3)).toEqual([1, 0, 0]);
  });
});

describe("deckBehind", () => {
  it("counts the cards in front of each one", () => {
    expect(deckBehind([1, 1, 1])).toEqual([2, 1, 0]);
    expect(deckBehind([1, 0, 0])).toEqual([0, 0, 0]);
  });

  it("is fractional while a card is arriving", () => {
    const b = deckBehind([1, 1, 0.4]);
    expect(b[0]).toBeCloseTo(1.4, 6);
    expect(b[1]).toBeCloseTo(0.4, 6);
    expect(b[2]).toBe(0);
  });
});

describe("deckActive", () => {
  it.each([
    [[1, 0, 0], 1],
    [[1, 0.49, 0], 1],
    [[1, 0.5, 0], 2],
    [[1, 1, 0.2], 2],
    [[1, 1, 0.9], 3],
  ])("%j shows card %i", (entries, card) => {
    expect(deckActive(entries)).toBe(card);
  });
});

describe("deckFoldOffset", () => {
  const travel = 400;
  const H = 800;

  it("the first anchor is in the middle of the viewport as the stage sticks", () => {
    // The stage sticks when the track's top is at stickTop: the middle of the
    // viewport is then H/2 - stickTop below the track's top.
    expect(deckFoldOffset(0, 3, travel, H)).toBe(H / 2 - DECK.stickTop);
  });

  it("each later anchor is in the middle when its card has landed", () => {
    for (const i of [1, 2]) {
      const landedT = (i - 1 + DECK.enter) / 2;
      const offset = deckFoldOffset(i, 3, travel, H);
      // Scrolled so the stage is at landedT: the track's top is here.
      const trackTop = DECK.stickTop - landedT * travel;
      expect(trackTop + offset).toBeCloseTo(H / 2, 6);
      expect(deckEntries(landedT, 3)[i]).toBe(1);
    }
  });

  it("anchors come in order down the track", () => {
    const offsets = [0, 1, 2].map((i) => deckFoldOffset(i, 3, travel, H));
    expect(offsets[1]).toBeGreaterThan(offsets[0]);
    expect(offsets[2]).toBeGreaterThan(offsets[1]);
  });
});

describe("pileFit", () => {
  const natural = { w: 320, h: 300 };

  it("is full size when there is room", () => {
    expect(pileFit(360, 420, natural)).toBe(1);
  });

  it("scales down to the room, by height or by width", () => {
    const byHeight = pileFit(360, 300, natural);
    expect(byHeight).toBeCloseTo(300 / (300 + DECK.pileHeadroom), 6);
    const byWidth = pileFit(280, 600, natural);
    expect(byWidth).toBeCloseTo(280 / (320 + DECK.pileSideRoom), 6);
  });

  it("the scaled pile, with its headroom, fits the room exactly", () => {
    const fit = pileFit(360, 300, natural)!;
    expect((natural.h + DECK.pileHeadroom) * fit).toBeLessThanOrEqual(300 + 1e-6);
  });

  it("refuses a room where the screens would be too small to read", () => {
    expect(pileFit(360, 200, natural)).toBeNull();
    expect(pileFit(200, 600, natural)).toBeNull();
    expect(pileFit(0, 0, natural)).toBeNull();
  });
});
