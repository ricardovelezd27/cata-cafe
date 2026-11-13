import { describe, expect, it } from "vitest";
import { ownExclusionNotice, type ExclusionRow } from "@/lib/exclusionNotice";
import {
  EXCLUSION_OTHER_MAX,
  EXCLUSION_REASONS,
  encodeExclusionReason,
  exclusionData,
  exclusionReasonText,
  isNewStoredExclusionReason,
  parseStoredExclusionReason,
} from "@/lib/exclusionReasons";

const LABELS: Record<string, string> = {
  sample_error: "Muestra equivocada",
  protocol: "No se siguió el protocolo (tueste, molienda, agua)",
  incomplete: "Cata incompleta",
  not_fit: "No estaba en condiciones de catar",
  test_duplicate: "Prueba o duplicado",
  other: "Otro motivo",
  calibration: "Calibración distinta",
};

const rows: ExclusionRow[] = [
  { userId: "me", excludedFromResults: false, exclusionReason: null },
  { userId: "alice", excludedFromResults: true, exclusionReason: "other:SECRETO-DE-ALICE" },
  { userId: "bob", excludedFromResults: true, exclusionReason: "not_fit" },
];

describe("ownExclusionNotice: a participant only ever gets their OWN state", () => {
  it("returns null for a viewer who is not excluded, whatever others are", () => {
    const out = ownExclusionNotice(rows, "me", LABELS);
    expect(out).toBeNull();
  });

  it("never carries another cupper's reason, id or text, in any serialization", () => {
    const out = ownExclusionNotice(rows, "me", LABELS);
    const json = JSON.stringify(out);
    expect(json).not.toContain("SECRETO-DE-ALICE");
    expect(json).not.toContain("alice");
    expect(json).not.toContain("bob");
    expect(json).not.toContain("condiciones");
  });

  it("returns exactly the viewer's own reason when they are excluded", () => {
    const own = ownExclusionNotice(rows, "bob", LABELS);
    expect(own).toEqual({ reason: "No estaba en condiciones de catar" });
    const json = JSON.stringify(own);
    expect(json).not.toContain("SECRETO-DE-ALICE");
    expect(json).not.toContain("alice");
  });

  it("uses the free text for 'other' and the old label for legacy values", () => {
    expect(ownExclusionNotice(rows, "alice", LABELS)).toEqual({ reason: "SECRETO-DE-ALICE" });
    const legacy: ExclusionRow[] = [
      { userId: "x", excludedFromResults: true, exclusionReason: "calibration" },
      { userId: "y", excludedFromResults: true, exclusionReason: "other" },
      { userId: "z", excludedFromResults: true, exclusionReason: "something_unknown" },
      { userId: "w", excludedFromResults: true, exclusionReason: null },
    ];
    expect(ownExclusionNotice(legacy, "x", LABELS)).toEqual({ reason: "Calibración distinta" });
    expect(ownExclusionNotice(legacy, "y", LABELS)).toEqual({ reason: "Otro motivo" });
    expect(ownExclusionNotice(legacy, "z", LABELS)).toEqual({ reason: "something_unknown" });
    expect(ownExclusionNotice(legacy, "w", LABELS)).toEqual({ reason: "" });
  });

  it("is null without a viewer or for a non-participant", () => {
    expect(ownExclusionNotice(rows, null, LABELS)).toBeNull();
    expect(ownExclusionNotice(rows, undefined, LABELS)).toBeNull();
    expect(ownExclusionNotice(rows, "stranger", LABELS)).toBeNull();
  });
});

describe("exclusion reasons (S10 WP5a, D2)", () => {
  it("offers exactly the owner's list and never scoring differently or a health reason", () => {
    expect([...EXCLUSION_REASONS]).toEqual([
      "sample_error",
      "protocol",
      "incomplete",
      "not_fit",
      "test_duplicate",
      "other",
    ]);
    expect(EXCLUSION_REASONS as readonly string[]).not.toContain("calibration");
  });

  it("encodes a code as itself and 'other' as other:<text>", () => {
    expect(encodeExclusionReason("protocol")).toBe("protocol");
    expect(encodeExclusionReason("other", "  muestra derramada  ")).toBe("other:muestra derramada");
  });

  it("requires the free text for 'other', within 120 chars", () => {
    expect(() => encodeExclusionReason("other")).toThrow("invalid_input");
    expect(() => encodeExclusionReason("other", "   ")).toThrow("invalid_input");
    expect(() => encodeExclusionReason("other", "x".repeat(EXCLUSION_OTHER_MAX + 1))).toThrow();
    expect(encodeExclusionReason("other", "x".repeat(EXCLUSION_OTHER_MAX))).toHaveLength(
      "other:".length + EXCLUSION_OTHER_MAX,
    );
  });

  it("rejects the retired calibration reason and unknown codes for NEW exclusions", () => {
    expect(() => encodeExclusionReason("calibration")).toThrow("invalid_input");
    expect(() => encodeExclusionReason("because")).toThrow("invalid_input");
    expect(() => encodeExclusionReason(undefined)).toThrow("invalid_input");
    expect(isNewStoredExclusionReason("calibration")).toBe(false);
    expect(isNewStoredExclusionReason("other")).toBe(false);
    expect(isNewStoredExclusionReason("other:")).toBe(false);
    expect(isNewStoredExclusionReason("other:algo")).toBe(true);
  });

  it("turns control characters in the free text into spaces", () => {
    expect(encodeExclusionReason("other", "a\nb\u0000c")).toBe("other:a b c");
  });

  it("exclusionData stores the encoded value", () => {
    const now = new Date("2026-11-13T00:00:00Z");
    const stored = encodeExclusionReason("other", "prueba");
    expect(exclusionData({ excluded: true, reason: stored, userId: "u", now }).exclusionReason).toBe(
      "other:prueba",
    );
    expect(() => exclusionData({ excluded: true, reason: "other", userId: "u", now })).toThrow();
  });

  it("stored values keep rendering: old label, free text, unknown value", () => {
    expect(exclusionReasonText("calibration", LABELS)).toBe("Calibración distinta");
    expect(exclusionReasonText("other:hola", LABELS)).toBe("hola");
    expect(exclusionReasonText("legacy_x", LABELS)).toBe("legacy_x");
    expect(exclusionReasonText(null, LABELS)).toBeNull();
    expect(parseStoredExclusionReason("other:  hola ")).toEqual({ code: "other", text: "hola" });
  });
});
