/**
 * Functions that run INSIDE the page (`page.evaluate(fn)`). Each one is serialised with its own
 * source, so it must not use anything from this module's scope: helpers are declared inside it.
 *
 * `measure` is the audit's measurement (2026-11-15) with its rules unchanged, so its numbers are
 * the numbers of REPORT.md; the `layout` block at the end folds in what the audit's second helper
 * (m-eval-page.js) measured: docked parts, sideways scrollers, clipped labels, text under 12 px.
 */

/** Everything the audit read from one screen. Returns plain JSON. */
export function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0.05;
  };
  const txt = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70);
  const name = (el) =>
    (el.getAttribute("aria-label") || el.getAttribute("title") || txt(el) || el.getAttribute("placeholder") || (el.querySelector("img[alt]") || {}).alt || "").trim();
  const cn = (el) => String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || "");
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const c = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 4).join(".");
    if (c) s += "." + c;
    return s.slice(0, 110);
  };
  const y = (el) => Math.round(el.getBoundingClientRect().top + window.scrollY);
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const over = (top, bot) => {
    const a = top.a;
    return { r: top.r * a + bot.r * (1 - a), g: top.g * a + bot.g * (1 - a), b: top.b * a + bot.b * (1 - a), a: 1 };
  };
  // The real background behind an element: the stack of translucent backgrounds up to the first opaque one, over white.
  // An element over a background IMAGE is not measurable here (null).
  const bgOf = (el) => {
    const stack = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        stack.push(c);
        if (c.a >= 1) break;
      }
      if (cs.backgroundImage && cs.backgroundImage !== "none" && !stack.length) return null;
      n = n.parentElement;
    }
    let b = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) b = over(stack[i], b);
    return b;
  };
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  // headings: painted size, weight, family and colour
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,[role=heading]")].filter(vis).map((h) => {
    const cs = getComputedStyle(h);
    return {
      tag: h.tagName.toLowerCase(),
      text: txt(h),
      px: +parseFloat(cs.fontSize).toFixed(2),
      weight: cs.fontWeight,
      family: cs.fontFamily.split(",")[0].replace(/["']/g, "").slice(0, 30),
      color: cs.color,
      align: cs.textAlign,
      italic: cs.fontStyle === "italic",
      upper: cs.textTransform === "uppercase",
      y: y(h),
      x: Math.round(h.getBoundingClientRect().left),
      sel: sel(h),
    };
  });

  // interactive elements: size, name, primary (the app's dark-green fill), first fold
  const inter = [
    ...document.querySelectorAll(
      'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=switch],[role=checkbox],[role=radio],[tabindex]:not([tabindex="-1"])',
    ),
  ].filter(vis);
  const targets = inter.map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const cls = el.getAttribute("class") || "";
    const bg = parse(cs.backgroundColor);
    const byClass = /\bbg-primary-container\b/.test(cls) && !/hover:bg-primary-container/.test(cls.replace(/\bbg-primary-container\b/, ""));
    const byColour = bg && hex(bg) === "#2c4c3b" && bg.a === 1;
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || "",
      name: name(el).slice(0, 60),
      w: Math.round(r.width),
      h: Math.round(r.height),
      x: Math.round(r.left),
      y: y(el),
      inFold: r.top >= 0 && r.bottom <= vh,
      primary: Boolean(byClass || byColour),
      disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
      fontPx: +parseFloat(cs.fontSize).toFixed(1),
      sel: sel(el),
      inlineInText: el.tagName === "A" && cs.display === "inline",
    };
  });
  const small = targets.filter((t) => !t.inlineInText && (t.w < 44 || t.h < 44));
  const tiny = targets.filter((t) => !t.inlineInText && (t.w < 24 || t.h < 24));
  const primaries = targets.filter((t) => t.primary && !t.disabled && (t.tag === "button" || t.tag === "a" || t.role === "button"));

  // text: painted sizes, contrast against the real background, numbers without tabular-nums
  const sizes = {};
  const lowContrast = [];
  const nonTabular = [];
  const under12 = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let node;
  let textCount = 0;
  while ((node = walker.nextNode())) {
    const s = node.nodeValue.replace(/\s+/g, " ").trim();
    if (!s) continue;
    const el = node.parentElement;
    if (!el || seen.has(el) || !vis(el)) continue;
    seen.add(el);
    if (el.closest("script,style,noscript,[aria-hidden=true] svg")) continue;
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize);
    textCount++;
    const key = px.toFixed(2);
    sizes[key] = (sizes[key] || 0) + 1;
    if (px < 12) under12.push(px.toFixed(1) + ":" + s.slice(0, 22));
    const fg0 = parse(cs.color);
    const bg = bgOf(el);
    if (fg0 && bg) {
      let op = 1;
      let n = el;
      while (n && n.nodeType === 1) {
        op *= parseFloat(getComputedStyle(n).opacity);
        n = n.parentElement;
      }
      const fg = over({ ...fg0, a: fg0.a * op }, bg);
      const L1 = lum(fg);
      const L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const large = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) {
        lowContrast.push({ text: s.slice(0, 50), ratio: +ratio.toFixed(2), px: +px.toFixed(1), fg: hex(fg), bg: hex(bg), opacity: +op.toFixed(2), sel: sel(el), y: y(el) });
      }
    }
    if (/^[\s\d.,:%±+\-−/]+$/.test(s) && /\d/.test(s) && !/tabular-nums/.test(cs.fontVariantNumeric)) {
      nonTabular.push({ text: s.slice(0, 20), sel: sel(el), y: y(el) });
    }
  }

  // classes the design system retires
  const legacy = {};
  const radius = {};
  document.querySelectorAll("[class]").forEach((el) => {
    (el.getAttribute("class") || "").split(/\s+/).forEach((c) => {
      const b = c.replace(/^([a-z-]+:)+/, "");
      if (/^(text|bg|border|ring|fill|stroke|from|to|via|divide|placeholder|decoration|outline)-(brown|cream|green-(dark|mid|light)|amber|red-defect|bg)\b/.test(b)) legacy[b] = (legacy[b] || 0) + 1;
      if (/^rounded(-[trblse]{1,2})?-(md|lg|xl|2xl|3xl)$/.test(b)) radius[b] = (radius[b] || 0) + 1;
    });
  });

  // layout
  const main = document.querySelector("main") || document.body;
  const mr = main.getBoundingClientRect();
  const firstChild = main.firstElementChild ? main.firstElementChild.getBoundingClientRect() : null;
  const de = document.documentElement;
  const wide = [];
  if (de.scrollWidth > vw + 1) {
    document.querySelectorAll("body *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0 && wide.length < 12 && vis(el)) wide.push({ sel: sel(el), right: Math.round(r.right), w: Math.round(r.width) });
    });
  }
  const h1 = headings.find((h) => h.tag === "h1");
  const firstPrimary = primaries.slice().sort((a, b) => a.y - b.y)[0] || null;
  const cards = [...document.querySelectorAll('[class*="rounded-card"]')]
    .filter(vis)
    .map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        y: y(el),
        pad: cs.padding,
        bg: cs.backgroundColor,
        border: cs.borderTopWidth + " " + cs.borderTopColor,
        shadow: cs.boxShadow === "none" ? "" : cs.boxShadow.slice(0, 60),
        radius: cs.borderTopLeftRadius,
      };
    })
    .slice(0, 60);
  const animated = [...document.querySelectorAll("body *")]
    .filter((el) => {
      const cs = getComputedStyle(el);
      return cs.animationName && cs.animationName !== "none" && vis(el);
    })
    .slice(0, 15)
    .map((el) => ({ sel: sel(el), anim: getComputedStyle(el).animationName, dur: getComputedStyle(el).animationDuration, iter: getComputedStyle(el).animationIterationCount }));
  const blur = [...document.querySelectorAll("body *")]
    .filter((el) => {
      const cs = getComputedStyle(el);
      return cs.backdropFilter && cs.backdropFilter !== "none" && vis(el);
    })
    .slice(0, 10)
    .map((el) => ({ sel: sel(el), filter: getComputedStyle(el).backdropFilter }));
  const bodyText = (document.body.innerText || "").replace(/\s+/g, " ").trim();

  const wordsBeforeFirstPrimary = (() => {
    if (!firstPrimary) return null;
    let n = 0;
    const w = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = w.nextNode())) {
      const el = t.parentElement;
      if (!el || !vis(el)) continue;
      if (el.getBoundingClientRect().top + window.scrollY >= firstPrimary.y) continue;
      const s = t.nodeValue.replace(/\s+/g, " ").trim();
      if (s) n += s.split(" ").length;
    }
    return n;
  })();

  // docked parts (fixed / sticky and shorter than the viewport), sideways scrollers, labels cut short
  const R = (e) => {
    const b = e.getBoundingClientRect();
    return { y: Math.round(b.top + window.scrollY), h: Math.round(b.height), w: Math.round(b.width), x: Math.round(b.left) };
  };
  const fixed = [...document.querySelectorAll("body *")]
    .filter((e) => {
      const p = getComputedStyle(e).position;
      return (p === "fixed" || p === "sticky") && vis(e) && e.getBoundingClientRect().height < vh;
    })
    .map((e) => ({ c: cn(e).slice(0, 60), pos: getComputedStyle(e).position, top: Math.round(e.getBoundingClientRect().top), ...R(e) }))
    .slice(0, 12);
  const hScrollers = [...document.querySelectorAll("*")]
    .filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 2 && vis(e))
    .map((e) => ({ c: cn(e).slice(0, 50), sw: e.scrollWidth, cw: e.clientWidth, y: R(e).y, snap: getComputedStyle(e).scrollSnapType }))
    .slice(0, 10);
  const clipped = [...main.querySelectorAll("button, a, th, [role=tab], label")]
    .filter((e) => vis(e) && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== "visible")
    .map((e) => ({ t: txt(e).slice(0, 30), sw: e.scrollWidth, cw: e.clientWidth }))
    .slice(0, 15);

  return {
    url: location.pathname + location.search,
    title: document.title,
    lang: de.lang,
    viewport: vw + "x" + vh,
    docHeight: de.scrollHeight,
    docWidth: de.scrollWidth,
    hOverflow: de.scrollWidth > vw + 1,
    overflowing: wide,
    rootFontPx: parseFloat(getComputedStyle(de).fontSize),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    main: {
      x: Math.round(mr.left),
      w: Math.round(mr.width),
      padding: getComputedStyle(main).padding,
      maxWidth: getComputedStyle(main).maxWidth,
      firstChild: firstChild ? { x: Math.round(firstChild.left), w: Math.round(firstChild.width) } : null,
    },
    headings,
    h1Count: headings.filter((h) => h.tag === "h1").length,
    textSizes: sizes,
    textNodes: textCount,
    words: bodyText ? bodyText.split(" ").length : 0,
    wordsBeforeFirstPrimary,
    primaries: primaries.map((p) => ({ name: p.name, y: p.y, inFold: p.inFold, w: p.w, h: p.h, sel: p.sel })),
    primariesInFold: primaries.filter((p) => p.inFold).length,
    targetsTotal: targets.length,
    targetsUnder44: small.map((t) => ({ name: t.name, w: t.w, h: t.h, tag: t.tag, role: t.role, y: t.y, sel: t.sel })).slice(0, 80),
    targetsUnder44Count: small.length,
    targetsUnder24Count: tiny.length,
    lowContrast: lowContrast.slice(0, 60),
    lowContrastCount: lowContrast.length,
    nonTabular: nonTabular.slice(0, 40),
    nonTabularCount: nonTabular.length,
    legacyClasses: legacy,
    legacyRadius: radius,
    cards,
    animated,
    backdropBlur: blur,
    h1: h1 || null,
    gapH1ToNextHeading: (() => {
      if (!h1) return null;
      const nx = headings.filter((h) => h.tag !== "h1" && h.y > h1.y)[0];
      return nx ? nx.y - h1.y : null;
    })(),
    tablists: [...document.querySelectorAll("[role=tablist]")]
      .filter(vis)
      .map((el) => ({ sel: sel(el), tabs: [...el.querySelectorAll("[role=tab]")].map((t) => txt(t).slice(0, 24)), scrollable: el.scrollWidth > el.clientWidth + 1 })),
    tables: [...document.querySelectorAll("table")]
      .filter(vis)
      .map((t) => ({
        cols: t.querySelectorAll("thead th").length,
        rows: t.querySelectorAll("tbody tr").length,
        w: Math.round(t.getBoundingClientRect().width),
        scrollW: t.parentElement ? t.parentElement.scrollWidth : 0,
        parentW: t.parentElement ? t.parentElement.clientWidth : 0,
      })),
    images: [...document.querySelectorAll("img")]
      .filter(vis)
      .filter((i) => !i.alt && i.getAttribute("aria-hidden") !== "true" && i.getAttribute("role") !== "presentation")
      .map((i) => (i.currentSrc || "").slice(-60))
      .slice(0, 10),
    toasts: [...document.querySelectorAll("[role=status],[role=alert]")].filter(vis).map(txt).filter(Boolean).slice(0, 8),
    layout: { fixed, hScrollers, clipped, under12: under12.slice(0, 40), under12Count: under12.length },
  };
}

/**
 * Replaces names in the page BEFORE it is measured and photographed: `pairs` is
 * [["real text", "placeholder"], ...] read from the gitignored local.json.
 *  - A text node that IS a listed text (whole node, 2+ characters) is replaced.
 *  - A listed text inside a longer node is replaced only if it has 4+ characters (3 for the
 *    "Catador" placeholders), on letter boundaries, so "Ana" never rewrites "Ananás".
 *  - Anything that looks like an email address is masked.
 * It also rewrites aria-label / title / placeholder / input values and the document title.
 * @param {Array<[string, string]>} pairs
 */
export function redactPage(pairs) {
  const numeric = /^[\d\s.,:%/+-]+$/;
  const exact = new Map(pairs.filter((p) => p[0].length >= 2 && !numeric.test(p[0])));
  const long = pairs.filter((p) => !numeric.test(p[0]) && p[0].length >= (p[1].startsWith("Catador") ? 3 : 4));
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const L = "\\p{L}\\p{N}";
  const res = long.map(([a, b]) => [new RegExp("(?<![" + L + "])" + esc(a) + "(?![" + L + "])", "gu"), b, a]);
  const fix = (v) => {
    const t = v.trim();
    if (!t) return v;
    if (exact.has(t)) return v.replace(t, exact.get(t));
    let o = v;
    for (const [re, b, a] of res) if (o.includes(a)) o = o.replace(re, b);
    return o.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "persona@ejemplo.com");
  };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const v = fix(n.nodeValue);
    if (v !== n.nodeValue) n.nodeValue = v;
  }
  document.querySelectorAll("[aria-label],[title],input,textarea").forEach((el) => {
    for (const at of ["aria-label", "title", "value", "placeholder"]) {
      const v0 = at === "value" && "value" in el ? el.value : el.getAttribute(at);
      if (!v0) continue;
      const v = fix(v0);
      if (v !== v0) {
        if (at === "value" && "value" in el) el.value = v;
        else el.setAttribute(at, v);
      }
    }
  });
  document.title = fix(document.title);
}

/** The hidden height of the tallest scroller that spans most of the width (the app shell scrolls inside a container). */
export function hiddenScrollHeight() {
  let best = 0;
  document.querySelectorAll("*").forEach((el) => {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 8 && el.getBoundingClientRect().width > window.innerWidth * 0.5) {
      best = Math.max(best, el.scrollHeight - el.clientHeight);
    }
  });
  return best;
}

/**
 * True once React's client code has run on this page: React puts an internal `__reactFiber$...` key
 * on each DOM node it hydrates or creates (and `__reactContainer$...` on the root). Server HTML alone
 * has neither, so this is a signal that client code ran, not a timing guess.
 * The Next dev-tools overlay (`<nextjs-portal>`) is its own React root and mounts even when the app does
 * not hydrate (a closed hot-reload socket), so it never counts: the mark must be on the app's own root
 * (`document`, `<html>`, `<body>`) or on a node outside the overlay.
 */
export function isHydrated() {
  const mark = (node) => Object.keys(node).some((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactContainer$"));
  if (mark(document) || mark(document.documentElement) || mark(document.body)) return true;
  for (const el of document.body.querySelectorAll("*")) {
    if (el.localName === "nextjs-portal" || el.closest("nextjs-portal")) continue;
    if (mark(el)) return true;
  }
  return false;
}
