import { describe, expect, it } from "vitest";
import {
  ANCHOR_LINE,
  anchorScrollTop,
  pickAnchor,
} from "@/components/landing/scrollAnchor";

/** Sections of a page, measured from the top of the viewport at `scrollY`. */
function measure(heights: number[], scrollY: number, firstTop = 60) {
  let top = firstTop - scrollY;
  return heights.map((height) => {
    const rect = { top, height };
    top += height;
    return rect;
  });
}

describe("pickAnchor", () => {
  const heights = [900, 1200, 1500, 800];

  it("at the top of the page it is the first section, at its start", () => {
    const anchor = pickAnchor(measure(heights, 0))!;
    expect(anchor.index).toBe(0);
    expect(anchor.ratio).toBeCloseTo((ANCHOR_LINE - 60) / 900, 6);
  });

  it("is the section the reading line is in", () => {
    // 60 + 900 = 960 is where section 1 starts; scrolled so it is 300px up.
    const anchor = pickAnchor(measure(heights, 960 - ANCHOR_LINE + 300))!;
    expect(anchor.index).toBe(1);
    expect(anchor.ratio).toBeCloseTo(300 / 1200, 6);
  });

  it("holds on to the last section at the very end", () => {
    const anchor = pickAnchor(measure(heights, 100000))!;
    expect(anchor.index).toBe(3);
    expect(anchor.ratio).toBe(1);
  });

  it("holds on to the first section when everything is still below the line", () => {
    expect(pickAnchor([{ top: 400, height: 600 }])).toEqual({ index: 0, ratio: 0 });
  });

  it("answers null for a page with no sections", () => {
    expect(pickAnchor([])).toBeNull();
  });
});

describe("anchorScrollTop", () => {
  it("never scrolls above the top of the page", () => {
    expect(anchorScrollTop(60, 900, 0)).toBe(0);
  });

  it("puts the reading line the same share of the way through the section", () => {
    expect(anchorScrollTop(960, 1200, 0.25)).toBe(960 + 300 - ANCHOR_LINE);
  });
});

describe("the reader's place survives a change of language", () => {
  // The same four sections, but the text is longer in one language.
  const es = [980, 1260, 1500, 820];
  const en = [900, 1200, 1500, 800];

  it.each([0, 700, 1400, 2600, 3900])("from scroll %i the section and the share are kept", (scrollY) => {
    const before = pickAnchor(measure(es, scrollY))!;
    const pageTop = 60 + en.slice(0, before.index).reduce((a, b) => a + b, 0);
    const restored = anchorScrollTop(pageTop, en[before.index], before.ratio);
    const after = pickAnchor(measure(en, restored))!;
    expect(after.index).toBe(before.index);
    // At the very top the scroll cannot go above 0, so the share may differ
    // by the few px between the header and the line.
    if (restored > 0) expect(after.ratio).toBeCloseTo(before.ratio, 6);
  });

  it("a pixel offset alone would have landed in another section", () => {
    // 2250 is inside section 2 in Spanish (starts at 60 + 980 + 1260 = 2300
    // minus the line), but the same pixels are section 2 only later in English.
    const scrollY = 60 + 980 + 1260 - ANCHOR_LINE - 40; // 40px before section 2 in Spanish
    expect(pickAnchor(measure(es, scrollY))!.index).toBe(1);
    expect(pickAnchor(measure(en, scrollY))!.index).toBe(2);
  });
});
