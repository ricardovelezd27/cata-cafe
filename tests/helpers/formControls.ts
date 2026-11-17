// Source-level reading of form controls in a .tsx file, for the accessible-name
// tests (N1 coffee form, N2 group pages). Pure string work, no React.

export type FormControl = {
  tag: "input" | "select" | "textarea";
  /** The expression of its `id` prop (`fid("name")`, `` `${uid}-email` ``), or null. */
  idExpr: string | null;
  /** Its `aria-label` / `aria-labelledby` expression, or null. */
  ariaExpr: string | null;
  /** `type="checkbox"` (named by a wrapping <label>). */
  checkbox: boolean;
  /** Inside a <label> that is still open where the control starts. */
  wrappedByLabel: boolean;
  at: number;
};

const EXPR = /=\{(`[^`\n]*`|[^{}\n]+(?:\{[^{}\n]*\}[^{}\n]*)*)\}/;

/** Each <input>, <select> and <textarea> of the source, with what names it. */
export function formControls(src: string): FormControl[] {
  const out: FormControl[] = [];
  for (const m of src.matchAll(/<(input|select|textarea)\b/g)) {
    const at = m.index!;
    // The props run until the first line that closes the tag (`/>` or `>` alone);
    // arrow functions inside a prop never start a line with them.
    const rest = src.slice(at);
    const end = rest.search(/\n\s*\/?>/);
    const props = end === -1 ? rest : rest.slice(0, end);
    const id = props.match(new RegExp(`\\bid${EXPR.source}`)) ?? props.match(/\bid="([^"]+)"/);
    const aria = props.match(new RegExp(`\\baria-(?:label|labelledby)${EXPR.source}`));
    const before = src.slice(0, at);
    out.push({
      tag: m[1] as FormControl["tag"],
      idExpr: id ? id[1].trim() : null,
      ariaExpr: aria ? aria[1].trim() : null,
      checkbox: /type="checkbox"/.test(props),
      wrappedByLabel: before.lastIndexOf("<label") > before.lastIndexOf("</label>"),
      at,
    });
  }
  return out;
}

/** The `htmlFor` expressions of the file's labels. */
export function labelTargets(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(new RegExp(`htmlFor${EXPR.source}`, "g"))) out.add(m[1].trim());
  for (const m of src.matchAll(/htmlFor="([^"]+)"/g)) out.add(m[1]);
  return out;
}
