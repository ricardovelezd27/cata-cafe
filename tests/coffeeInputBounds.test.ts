import { describe, expect, it } from "vitest";
import {
  COFFEE_FIELD_MAX,
  COFFEE_NAME_MAX,
  COFFEE_NOTES_MAX,
  MAX_WIZARD_COFFEES,
  SAMPLE_LABEL_MAX,
  checkWizardBounds,
  normalizeCoffeeFields,
} from "@/lib/coffeeInputBounds";

const CERTS = ["4C", "Orgánico", "Otro"] as const;
const ok = (o: unknown) => normalizeCoffeeFields(o, "create", CERTS);

describe("normalizeCoffeeFields", () => {
  it("trims, nulls blanks and keeps known certifications", () => {
    const r = ok({ name: "  Geisha ", country: " Panamá ", farm: "  ", certifications: ["4C", "4C"] });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.value.name).toBe("Geisha");
      expect(r.value.country).toBe("Panamá");
      expect(r.value.farm).toBeNull();
      expect(r.value.certifications).toEqual(["4C"]);
    }
  });
  it("requires a name and bounds its length", () => {
    expect(ok({ name: "  " })).toEqual({ ok: false, error: "name_required" });
    expect(ok({})).toEqual({ ok: false, error: "name_required" });
    expect(ok({ name: "x".repeat(COFFEE_NAME_MAX + 1) })).toEqual({ ok: false, error: "invalid_input" });
    expect(ok({ name: "x".repeat(COFFEE_NAME_MAX) }).ok).toBe(true);
  });
  it("rejects non-strings and over-long fields instead of throwing", () => {
    expect(ok({ name: 5 })).toEqual({ ok: false, error: "invalid_input" });
    expect(ok({ name: "a", country: 7 })).toEqual({ ok: false, error: "invalid_input" });
    expect(ok({ name: "a", farm: "f".repeat(COFFEE_FIELD_MAX + 1) }).ok).toBe(false);
    expect(ok({ name: "a", notes: "n".repeat(COFFEE_NOTES_MAX + 1) }).ok).toBe(false);
    expect(ok(null)).toEqual({ ok: false, error: "invalid_input" });
  });
  it("rejects an unknown certification on create, drops it on update", () => {
    expect(ok({ name: "a", certifications: ["Nope"] }).ok).toBe(false);
    expect(ok({ name: "a", certifications: "4C" }).ok).toBe(false);
    const upd = normalizeCoffeeFields({ name: "a", certifications: ["Nope", "Orgánico"] }, "update", CERTS);
    expect(upd.ok && upd.value.certifications).toEqual(["Orgánico"]);
  });
});

describe("checkWizardBounds", () => {
  const coffee = { name: "Café" };
  it("accepts a normal payload", () => {
    expect(checkWizardBounds([coffee], [{ label: "A", coffeeIdx: 0 }], CERTS)).toBeNull();
    expect(checkWizardBounds([{ existingCoffeeId: "abc" }], [{}], CERTS)).toBeNull();
  });
  it("caps the number of coffees", () => {
    const many = Array.from({ length: MAX_WIZARD_COFFEES + 1 }, () => coffee);
    expect(checkWizardBounds(many, [], CERTS)).toBe("too_many_coffees");
    expect(checkWizardBounds(many.slice(1), [], CERTS)).toBeNull();
  });
  it("rejects a 5 000-char label and a non-string label", () => {
    expect(checkWizardBounds([coffee], [{ label: "x".repeat(5000) }], CERTS)).toBe("invalid_label");
    expect(checkWizardBounds([coffee], [{ label: "x".repeat(SAMPLE_LABEL_MAX) }], CERTS)).toBeNull();
    expect(checkWizardBounds([coffee], [{ label: 12 }], CERTS)).toBe("invalid_label");
  });
  it("rejects a bad certification, a non-string name and non-objects", () => {
    expect(checkWizardBounds([{ name: "a", certifications: ["Nope"] }], [], CERTS)).toBe("invalid_coffee");
    expect(checkWizardBounds([{ name: 5 }], [], CERTS)).toBe("invalid_coffee");
    expect(checkWizardBounds(["x"], [], CERTS)).toBe("invalid_coffee");
  });
  it("leaves a blank name to the wizard's own missing_coffee_fields check", () => {
    expect(checkWizardBounds([{ name: "  " }], [], CERTS)).toBeNull();
  });
});
