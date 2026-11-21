// How a score is printed: the page and its PDF share these two (pure).

/** Two decimals, as every score of the app is printed. */
export function formatScore(value: number): string {
  return value.toFixed(2);
}

/** A difference in ink with its sign: "+2.00", "−0.50" (a real minus), "0.00". */
export function formatSigned(value: number): string {
  const text = Math.abs(value).toFixed(2);
  if (Number(text) === 0) return text;
  return value > 0 ? `+${text}` : `−${text}`;
}
