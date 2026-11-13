// "hoy" / "hace 3 días" / "hace 2 meses" for the co-cupper card (S10 WP6 A4): the wording
// comes from the caller's translations (messages), the counting lives here so it is
// tested. Dependency-free. The `{n}` placeholders are filled here, never by ICU plurals.

export type RelativeDateLabels = {
  today: string;
  oneDay: string;
  /** Contains "{n}". */
  days: string;
  oneMonth: string;
  /** Contains "{n}". */
  months: string;
  oneYear: string;
  /** Contains "{n}". */
  years: string;
};

export function formatRelativeDate(date: Date, labels: RelativeDateLabels, now: number = Date.now()): string {
  const days = Math.floor((now - date.getTime()) / (1000 * 60 * 60 * 24));
  const fill = (template: string, n: number) => template.replace("{n}", String(n));
  if (days <= 0) return labels.today;
  if (days === 1) return labels.oneDay;
  if (days < 30) return fill(labels.days, days);
  const months = Math.floor(days / 30);
  if (months === 1) return labels.oneMonth;
  if (months < 12) return fill(labels.months, months);
  const years = Math.floor(months / 12);
  return years === 1 ? labels.oneYear : fill(labels.years, years);
}
