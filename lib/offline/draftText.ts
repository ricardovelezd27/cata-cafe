// Pure: turns a stored evaluation module (JSON) into plain text the cupper can
// read and copy from the "Notas sin sincronizar" panel (S8-09). Generic on
// purpose: the module shapes are dynamic JSON (CLAUDE.md "Evaluation Data
// Shape"), so this prints `key: value` lines and never reinterprets scoring.

const MAX_DEPTH = 3;

function formatValue(value: unknown, depth: number): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((v) => formatValue(v, depth + 1)).filter(Boolean);
    return parts.join(", ");
  }
  if (typeof value === "object") {
    if (depth >= MAX_DEPTH) return "";
    const parts = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const text = formatValue(v, depth + 1);
        return text ? `${k}: ${text}` : "";
      })
      .filter(Boolean);
    return parts.join("; ");
  }
  return "";
}

export function draftToText(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([key, value]) => {
      const text = formatValue(value, 0);
      return text ? `${key}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}
