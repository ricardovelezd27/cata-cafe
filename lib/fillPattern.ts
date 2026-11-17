// Fill a message that carries `{placeholders}` on the client.
//
// The project's i18n rule: a client component receives its strings as props, and
// a string with a placeholder is fetched on the server with `t.raw()` (calling
// `t()` without the argument renders the raw key). This is the one helper that
// turns such a pattern into text: "{count} de {n}" + { count: 6, n: 7 }.
// A placeholder with no value is left as written, so a missing argument is seen
// on the screen instead of printing "undefined". Pure.

export function fillPattern(pattern: string, vars: Readonly<Record<string, string | number>>): string {
  return pattern.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole,
  );
}
