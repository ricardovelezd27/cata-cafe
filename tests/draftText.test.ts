import { describe, expect, it } from "vitest";
import { draftToText } from "@/lib/offline/draftText";

describe("draftToText", () => {
  it("prints readable key: value lines and skips empties", () => {
    const text = draftToText({
      nota_express: "  Dulce, panela  ",
      acidity: 7,
      empty: "",
      nothing: null,
      flavors: ["chocolate", "naranja"],
      nested: { a: 1, b: "", c: { d: true } },
    });
    expect(text).toBe(
      ["nota_express: Dulce, panela", "acidity: 7", "flavors: chocolate, naranja", "nested: a: 1; c: d: true"].join(
        "\n",
      ),
    );
  });
  it("returns an empty string for an empty module", () => {
    expect(draftToText({})).toBe("");
  });
});
