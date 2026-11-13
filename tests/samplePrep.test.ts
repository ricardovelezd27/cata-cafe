import { describe, expect, it } from "vitest";
import {
  gateSamplePrep,
  parseRoastDate,
  parseSamplePrepInput,
  samplePrepVisible,
  toSamplePrep,
  type SamplePrepRow,
} from "@/lib/samplePrep";
import { ValidationError } from "@/lib/validate";

const NOW = Date.UTC(2026, 10, 13, 12, 0, 0); // 2026-11-13 12:00 UTC

const row = (over: Partial<SamplePrepRow> = {}): SamplePrepRow => ({
  roastDate: new Date(Date.UTC(2026, 10, 1)),
  preparationNote: "92 C, 1:16, media",
  offProtocol: true,
  offProtocolNote: "agua del grifo",
  ...over,
});

describe("samplePrepVisible / gateSamplePrep (blind gate)", () => {
  it("owner always, everyone else only once revealed", () => {
    expect(samplePrepVisible({ ownerView: true, revealed: false })).toBe(true);
    expect(samplePrepVisible({ ownerView: false, revealed: true })).toBe(true);
    expect(samplePrepVisible({ ownerView: false, revealed: false })).toBe(false);
  });

  it("a participant of a blind sample receives null, never the data", () => {
    expect(gateSamplePrep(row(), { ownerView: false, revealed: false })).toBeNull();
  });

  it("the owner and a revealed sample get the data", () => {
    const expected = {
      roastDate: "2026-11-01",
      preparationNote: "92 C, 1:16, media",
      offProtocol: true,
      offProtocolNote: "agua del grifo",
    };
    expect(gateSamplePrep(row(), { ownerView: true, revealed: false })).toEqual(expected);
    expect(gateSamplePrep(row(), { ownerView: false, revealed: true })).toEqual(expected);
  });

  it("nothing entered = null even for the owner", () => {
    const empty = row({ roastDate: null, preparationNote: null, offProtocol: false, offProtocolNote: null });
    expect(toSamplePrep(empty)).toBeNull();
    expect(gateSamplePrep(empty, { ownerView: true, revealed: true })).toBeNull();
  });

  it("an off-protocol note without the tick is not shown", () => {
    expect(toSamplePrep(row({ offProtocol: false, roastDate: null, preparationNote: null }))).toBeNull();
  });
});

describe("parseRoastDate", () => {
  it("accepts a real past date and today", () => {
    expect(parseRoastDate("2026-11-01", NOW).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(parseRoastDate("2026-11-13", NOW).toISOString()).toBe("2026-11-13T00:00:00.000Z");
  });
  it("accepts the owner's today when they are ahead of UTC, but not tomorrow", () => {
    expect(() => parseRoastDate("2026-11-14", NOW)).not.toThrow(); // UTC+13 owner
    expect(() => parseRoastDate("2026-11-15", NOW)).toThrow(ValidationError);
  });
  it("rejects the future, nonsense and impossible dates", () => {
    for (const bad of ["2027-01-01", "11/01/2026", "2026-13-01", "2026-02-30", "", "hoy", "1900-01-01"]) {
      expect(() => parseRoastDate(bad, NOW), bad).toThrow(ValidationError);
    }
    expect(() => parseRoastDate(20261101 as unknown, NOW)).toThrow(ValidationError);
  });
});

describe("parseSamplePrepInput (merge semantics)", () => {
  it("absent keys write nothing", () => {
    expect(parseSamplePrepInput({}, NOW)).toEqual({});
  });
  it("empty string and null clear", () => {
    expect(parseSamplePrepInput({ roastDate: "", preparationNote: "  ", offProtocolNote: null }, NOW)).toEqual({
      roastDate: null,
      preparationNote: null,
      offProtocolNote: null,
    });
  });
  it("sets and trims values", () => {
    expect(
      parseSamplePrepInput(
        { roastDate: "2026-11-02", preparationNote: " 92 C ", offProtocol: true, offProtocolNote: " grifo " },
        NOW,
      ),
    ).toEqual({
      roastDate: new Date(Date.UTC(2026, 10, 2)),
      preparationNote: "92 C",
      offProtocol: true,
      offProtocolNote: "grifo",
    });
  });
  it("unticking off-protocol clears its note, even if one is posted", () => {
    expect(parseSamplePrepInput({ offProtocol: false, offProtocolNote: "x" }, NOW)).toEqual({
      offProtocol: false,
      offProtocolNote: null,
    });
  });
  it("rejects over-long notes, a future roast date and a non-boolean tick", () => {
    expect(() => parseSamplePrepInput({ preparationNote: "x".repeat(501) }, NOW)).toThrow(ValidationError);
    expect(() => parseSamplePrepInput({ offProtocolNote: "x".repeat(501), offProtocol: true }, NOW)).toThrow(
      ValidationError,
    );
    expect(() => parseSamplePrepInput({ roastDate: "2030-01-01" }, NOW)).toThrow(ValidationError);
    expect(() => parseSamplePrepInput({ offProtocol: "yes" as unknown as boolean }, NOW)).toThrow(ValidationError);
    expect(() => parseSamplePrepInput({ preparationNote: 5 as unknown as string }, NOW)).toThrow(ValidationError);
  });
});

describe("parseSamplePrepInput (off-protocol note needs the flag)", () => {
  it("a note posted while the flag is false (stored or default) is dropped", () => {
    expect(parseSamplePrepInput({ offProtocolNote: "grifo" }, NOW)).toEqual({});
    expect(parseSamplePrepInput({ offProtocolNote: "grifo" }, NOW, false)).toEqual({});
  });
  it("a note posted while the STORED flag is true is kept", () => {
    expect(parseSamplePrepInput({ offProtocolNote: " grifo " }, NOW, true)).toEqual({ offProtocolNote: "grifo" });
  });
  it("a note posted with the flag set in the same update is kept", () => {
    expect(parseSamplePrepInput({ offProtocol: true, offProtocolNote: "x" }, NOW, false)).toEqual({ offProtocol: true, offProtocolNote: "x" });
  });
  it("unticking the flag drops the note even if the stored flag is true", () => {
    expect(parseSamplePrepInput({ offProtocol: false, offProtocolNote: "x" }, NOW, true)).toEqual({ offProtocol: false, offProtocolNote: null });
  });
});
