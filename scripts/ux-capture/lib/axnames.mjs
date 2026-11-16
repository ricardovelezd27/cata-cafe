/**
 * `unnamedControls`: which interactive controls have no accessible name, as the BROWSER computes it.
 *
 * Why not a reimplementation: the accessible-name algorithm (aria-labelledby, aria-label, a label by
 * `for` or by wrapping, alt, title, text content, value of a button, the svg `<title>`, the order of
 * all of them) is the browser's job, and a copy drifts. Chrome exposes its answer through the
 * DevTools Protocol (`Accessibility.getFullAXTree`); this reads it and decides only two things itself:
 *   - which elements are controls that need a name (`collectControls`, runs in the page), and
 *   - what to do with the answer (`classifyAxNode`, pure, unit-tested).
 * One rule is the project's, not the browser's: a placeholder alone does NOT count as a name (Chrome
 * falls back to it; a screen reader announces it only until the field is filled). Chrome says where a
 * name came from, so a name whose only source is the placeholder is reported as `placeholder-only`.
 *
 * Skipped: controls that are inert, `aria-hidden`, `hidden`, disabled, not painted, or inside a closed `<details>`. Chrome agrees
 * (an inert or hidden subtree has no accessibility node; an `aria-hidden` one is "ignored").
 */

/**
 * Runs IN THE PAGE. The controls to check, or their descriptions (same order as the elements).
 * @param {boolean} wantMeta true = plain descriptions; false = the elements themselves
 */
export function collectControls(wantMeta) {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0.05;
  };
  // The content of a closed <details> (everything but its <summary>) is not rendered, not focusable and not exposed,
  // although the browser still reports a box for it.
  const inClosedDetails = (el) => {
    for (let d = el.closest("details"); d; d = d.parentElement ? d.parentElement.closest("details") : null) {
      const summary = el.closest("summary");
      if (!d.open && !(summary && summary.parentElement === d)) return true;
    }
    return false;
  };
  const els = [...document.querySelectorAll(
    'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=switch],[role=checkbox],[role=radio],[tabindex]:not([tabindex="-1"])',
  )].filter((el) => vis(el) && !el.closest('[inert],[aria-hidden="true"],[hidden]') && !inClosedDetails(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true");
  if (!wantMeta) return els;
  return els.map((el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const c = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 4).join(".");
    if (c) s += "." + c;
    return { tag: el.tagName.toLowerCase(), id: el.id || "", sel: s.slice(0, 110), y: Math.round(el.getBoundingClientRect().top + window.scrollY) };
  });
}

/** AX roles that are structure, not controls: a `tabindex` scroller or a focusable region does not need a name. */
const NOT_A_CONTROL = new Set([
  "generic", "none", "presentation", "group", "region", "article", "main", "navigation", "banner", "contentinfo", "complementary",
  "list", "listitem", "table", "rowgroup", "row", "cell", "paragraph", "heading", "StaticText", "InlineTextBox", "RootWebArea", "document",
]);

/**
 * The verdict for one control, from its node in Chrome's accessibility tree. PURE.
 * @param {any} ax a CDP AXNode, or undefined when the element has none
 * @returns {{ status: "named" | "unnamed" | "placeholder-only" | "ignored" | "not-a-control" | "no-ax-node", role: string, name: string }}
 */
export function classifyAxNode(ax) {
  if (!ax) return { status: "no-ax-node", role: "", name: "" };
  const role = String(ax.role?.value ?? "");
  const name = String(ax.name?.value ?? "").trim();
  if (ax.ignored) return { status: "ignored", role, name };
  if (NOT_A_CONTROL.has(role)) return { status: "not-a-control", role, name };
  if (!name) return { status: "unnamed", role, name };
  const used = (ax.name?.sources ?? []).filter((s) => s && s.value && !s.superseded && !s.invalid);
  if (used.length > 0 && used.every((s) => s.type === "placeholder")) return { status: "placeholder-only", role, name };
  return { status: "named", role, name };
}

/** Counts and the list of what fails, from the controls' descriptions and their verdicts. PURE. */
export function summarizeNames(metas, verdicts) {
  const counts = { checked: metas.length, named: 0, unnamed: 0, placeholderOnly: 0, ignored: 0, notAControl: 0, noAxNode: 0 };
  const unnamed = [];
  metas.forEach((meta, i) => {
    const v = verdicts[i];
    if (v.status === "named") counts.named++;
    else if (v.status === "ignored") counts.ignored++;
    else if (v.status === "not-a-control") counts.notAControl++;
    else if (v.status === "no-ax-node") counts.noAxNode++;
    else {
      if (v.status === "unnamed") counts.unnamed++;
      else counts.placeholderOnly++;
      unnamed.push({ ...meta, role: v.role, why: v.status === "unnamed" ? "no accessible name" : "placeholder only", ...(v.status === "placeholder-only" ? { placeholder: v.name.slice(0, 30) } : {}) });
    }
  });
  return { counts, unnamed: unnamed.slice(0, 30), unnamedCount: unnamed.length };
}

/**
 * Reads the accessible name of every control on the page from Chrome. Needs a Chromium page.
 * @param {import("playwright-core").Page} page
 */
export async function readControlNames(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("Accessibility.enable");
    const metas = await page.evaluate(collectControls, true);
    const list = await cdp.send("Runtime.evaluate", { expression: `(${collectControls.toString()})(false)`, returnByValue: false });
    const props = await cdp.send("Runtime.getProperties", { objectId: list.result.objectId, ownProperties: true });
    const objects = props.result.filter((p) => /^\d+$/.test(p.name)).map((p) => p.value.objectId);
    if (objects.length !== metas.length) throw new Error(`controls changed while reading names (${objects.length} vs ${metas.length})`);
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const byBackend = new Map(nodes.filter((n) => n.backendDOMNodeId).map((n) => [n.backendDOMNodeId, n]));
    const verdicts = [];
    for (const objectId of objects) {
      const { node } = await cdp.send("DOM.describeNode", { objectId });
      verdicts.push(classifyAxNode(byBackend.get(node.backendNodeId)));
    }
    return summarizeNames(metas, verdicts);
  } finally {
    await cdp.detach().catch(() => {});
  }
}

/** Small documents with the expected verdict of each control (by id): used by `--self-test` and by the unit test. */
export const FIXTURE_HTML = `<!doctype html><html><body>
<label for="label-for">Fecha</label><input id="label-for" type="date">
<label>Nombre <input id="wrapping" type="text"></label>
<span id="vis-text">Visible text</span><input id="labelledby" aria-labelledby="vis-text">
<input id="placeholder-only" placeholder="Solo placeholder">
<input id="title-only" title="Solo title">
<input id="no-name" type="text">
<button id="icon-no-label"><svg width="10" height="10"><path d="M0 0h10v10z"/></svg></button>
<button id="icon-aria-label" aria-label="Cerrar"><svg width="10" height="10"><path d="M0 0h10v10z"/></svg></button>
<button id="img-alt"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Alt name"></button>
<button id="text-button">Texto</button>
<input id="submit-value" type="submit" value="Enviar">
<a id="svg-title" href="#x"><svg width="10" height="10"><title>Titulo svg</title><path d="M0 0h10v10z"/></svg></a>
<label for="label-span"><span>Etiqueta con span</span></label><input id="label-span" type="checkbox">
<input id="checkbox-no-name" type="checkbox">
<div id="switch-no-name" role="switch" tabindex="0" style="width:20px;height:20px"></div>
<button id="labelledby-missing" aria-labelledby="not-there"></button>
<div inert><button id="inert-empty"></button></div>
<div aria-hidden="true"><button id="aria-hidden-empty"></button></div>
<div hidden><button id="hidden-empty"></button></div>
<button id="disabled-empty" disabled></button>
<div id="scroll-region" tabindex="0">a focusable scroller</div>
<details><summary id="details-summary">More</summary><button id="details-empty"></button></details>
<details open><summary>Open</summary><button id="open-details-empty"></button></details>
</body></html>`;

/** What the self-test expects of FIXTURE_HTML: the ids that must be reported, and why. Everything else must be named or skipped. */
export const FIXTURE_UNNAMED = {
  "placeholder-only": "placeholder only",
  "no-name": "no accessible name",
  "icon-no-label": "no accessible name",
  "checkbox-no-name": "no accessible name",
  "switch-no-name": "no accessible name",
  "open-details-empty": "no accessible name",
  "labelledby-missing": "no accessible name",
};

/** The ids FIXTURE_HTML names or skips on purpose, so a test can prove they are NOT reported. */
export const FIXTURE_FINE = ["label-for", "wrapping", "labelledby", "title-only", "icon-aria-label", "img-alt", "text-button", "submit-value", "svg-title", "label-span", "inert-empty", "aria-hidden-empty", "hidden-empty", "disabled-empty", "scroll-region", "details-summary", "details-empty"];
