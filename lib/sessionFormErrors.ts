/**
 * Which wizard field a server/client validation error code belongs to
 * (S9-03, F-crear-sesion-6). Pure and dependency-free so it is unit-tested.
 * Codes that belong to no single field (coffee cards, samples, auth, network…)
 * return null and stay in the general strip above the submit button.
 */
export type SessionFormField = "name" | "date" | "closesAt" | "cups";

const FIELD_BY_CODE: Record<string, SessionFormField> = {
  invalid_name: "name",
  invalid_date: "date",
  invalid_closes_at: "closesAt",
  invalid_cups: "cups",
};

export function fieldForErrorCode(code: string | null | undefined): SessionFormField | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(FIELD_BY_CODE, code) ? FIELD_BY_CODE[code] : null;
}

/** DOM id of a field's input, shared by the form and the focus helper. */
export function fieldInputId(field: SessionFormField): string {
  return `session-field-${field}`;
}

/** DOM id of a field's error paragraph (for aria-describedby). */
export function fieldErrorId(field: SessionFormField): string {
  return `session-field-${field}-error`;
}
