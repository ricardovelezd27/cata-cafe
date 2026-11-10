// "Today" as the person sees it. `new Date().toISOString().slice(0, 10)` is the
// UTC date, which after ~19:00 in the Americas is already TOMORROW — the wizard
// pre-filled the wrong day and the closing-date `min` refused today (S8-10 T4,
// F-crear-sesion-8 / F-04-7). Pure so vitest can pin the timezone behaviour.

/** YYYY-MM-DD in the local calendar of `now`. */
export function localDateISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
