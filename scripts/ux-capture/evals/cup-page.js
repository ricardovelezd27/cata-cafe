(() => {
  // The cup page's own measures: docked bars, the canvas and its footer, the rating bubbles, cup
  // toggles, pills, sliders, form fields, the save indicator, dialogs and animations.
  // It reads the CSS-module class names of the cup components (SessionShell, CanvasFooter,
  // AffectiveBubbles, CupToggleGrid, CATAPills, IntensitySlider), so a rename of one of them
  // makes that key come back null or empty: that is the signal to update this file.
  const R = (e) => {
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { y: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width), x: Math.round(b.left) };
  };
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)].filter((e) => e.getBoundingClientRect().height > 0);
  const cls = (e) => String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className);
  const cv = q("[class*=SessionShell-module][class*=__canvas]");
  return {
    vh: innerHeight,
    vw: innerWidth,
    scrollW: document.documentElement.scrollWidth,
    mobileHeader: R(q("[class*=__mobileHeader]")),
    topBar: R(q("[class*=SessionShell-module][class*=__topBar]")),
    details: R(q("[class*=__mobileDetails]")),
    canvas: R(cv),
    canvasScrollH: cv ? cv.scrollHeight : null,
    footer: R(q("[class*=CanvasFooter-module][class*=__bar]")),
    footerBtns: qa("[class*=CanvasFooter-module][class*=__button]").map((e) => ({ t: e.textContent.trim(), ...R(e) })),
    bubbles: qa("[class*=AffectiveBubbles-module][class*=__bubble]").slice(0, 18).map(R),
    cups: qa("[class*=CupToggleGrid-module][class*=__cup]").map(R),
    defectPills: qa("[class*=__defectPill]").map((e) => ({ t: e.textContent.trim(), ...R(e) })),
    pills: qa("[class*=CATAPills-module][class*=__pill]").slice(0, 50).map((e) => ({ t: e.textContent.trim().slice(0, 18), ...R(e) })),
    tracks: qa("[class*=IntensitySlider-module][class*=__track]").map(R),
    thumbs: qa("[class*=IntensitySlider-module][class*=__thumb]").map(R),
    save: qa("[class*=__saveIndicator],[class*=__savePendingLabel]").map((e) => ({ c: cls(e).slice(-30), t: e.textContent, anim: getComputedStyle(e).animationName, ...R(e) })),
    fields: qa("input,textarea,select").map((e) => ({ t: e.tagName + (e.type ? ":" + e.type : ""), fs: getComputedStyle(e).fontSize, ph: (e.placeholder || "").slice(0, 25), ...R(e) })),
    fixed: qa("body *")
      .filter((e) => {
        const p = getComputedStyle(e).position;
        return p === "fixed" || p === "sticky";
      })
      .map((e) => ({ c: cls(e).slice(0, 50), ...R(e) }))
      .slice(0, 15),
    dialog: R(q("[role=dialog]")),
    dialogClose: qa("[role=dialog] button").slice(0, 3).map((e) => ({ t: (e.getAttribute("aria-label") || e.textContent).trim().slice(0, 20), ...R(e) })),
    status: qa("[role=status],[role=alert]").map((e) => ({ t: e.textContent.trim().slice(0, 80), ...R(e) })),
    animated: qa("body *")
      .filter((e) => {
        const cs = getComputedStyle(e);
        return cs.animationName !== "none" && cs.animationPlayState === "running";
      })
      .map((e) => ({ c: cls(e).slice(0, 50), a: getComputedStyle(e).animationName, d: getComputedStyle(e).animationIterationCount }))
      .slice(0, 10),
  };
})()
