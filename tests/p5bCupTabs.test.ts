import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
import { AffectiveBubbles, SCALE_COPY_FALLBACK } from "@/components/ui/AffectiveBubbles";
import { SampleTabs } from "@/components/ui/SampleTabs";
import { ModuleSwitcher } from "@/components/ui/ModuleSwitcher";
import { PhaseStepper } from "@/components/cupping/PhaseStepper";
import { CUP_PLACE_FALLBACK } from "@/lib/cupPlace";
import { cupExitHref } from "@/lib/cupExit";
import { readSource as read } from "./helpers/sourceTree";

// P5b of the 2026-11-15 UI/UX audit: the cup page's tabs, steps and place (D-01, D-02, D-04,
// H-08, B-03). The proofs that nothing a control writes changed are browser runs (in the PR).

const tabStops = (html: string) => (html.match(/tabindex="0"/g) ?? []).length;

describe("H-08: a rating is a radio group, one Tab stop, names in both languages", () => {
  it("nine radios in one named group; the checked one holds the Tab stop", () => {
    const html = renderToStaticMarkup(h(AffectiveBubbles, { value: 7, onChange: () => {}, ariaLabel: "Fragancia" }));
    expect(html).toMatch(/role="radiogroup" aria-label="Fragancia"/);
    expect((html.match(/role="radio"/g) ?? []).length).toBe(9);
    expect(tabStops(html)).toBe(1);
    expect(html).toMatch(/tabindex="0"[^>]*aria-label="7 — Moderadamente alto"|aria-checked="true" tabindex="0"/);
    expect((html.match(/aria-checked="true"/g) ?? []).length).toBe(1);
  });
  it("with nothing checked the first holds the stop; a locked row has none", () => {
    expect(tabStops(renderToStaticMarkup(h(AffectiveBubbles, { value: null, onChange: () => {} })))).toBe(1);
    expect(tabStops(renderToStaticMarkup(h(AffectiveBubbles, { value: 5, onChange: () => {}, disabled: true })))).toBe(0);
  });
  it("names the values in English on the English page", () => {
    const html = renderToStaticMarkup(h(AffectiveBubbles, { value: null, onChange: () => {}, scale: SCALE_COPY_FALLBACK.en }));
    expect(html).toContain('aria-label="9 — Extremely high"');
    expect(html).not.toContain("Extremadamente");
  });
  it("no FINAL readout and no visible scale words (the owner's decision); the words stay as the radios' names", () => {
    const html = renderToStaticMarkup(h(AffectiveBubbles, { value: 6, onChange: () => {}, ariaLabel: "Aroma" }));
    expect(html).not.toMatch(/Final/);
    // each word appears once, inside an aria-label, never as visible text
    expect(html.match(/Extremadamente bajo/g)).toHaveLength(1);
    expect(html).toContain('aria-label="1 — Extremadamente bajo"');
    expect(html).not.toMatch(/>Extremadamente|>Ni alto ni bajo/);
    expect(read("components/ui/AffectiveBubbles.module.css")).not.toMatch(/\.final|\.scale/);
  });
  it("the fallbacks equal the message files (cupping.scale, cupping.place)", () => {
    expect(es.cupping.scale).toEqual(SCALE_COPY_FALLBACK.es);
    expect(en.cupping.scale).toEqual(SCALE_COPY_FALLBACK.en);
    expect(es.cupping.place).toEqual(CUP_PLACE_FALLBACK.es);
    expect(en.cupping.place).toEqual(CUP_PLACE_FALLBACK.en);
  });
  it("a key checks through the same onChange a tap calls (no other write path)", () => {
    const src = read("components/ui/AffectiveBubbles.tsx");
    expect(src).toMatch(/if \(next !== checked\) onChange\(VALUES\[next\]\)/);
    expect(src).toMatch(/onClick=\{\(\) => onChange\(n\)\}/);
    expect(src).toMatch(/nextRovingIndex, tabStopIndex \} from '@\/lib\/rovingFocus'/);
  });
});

describe("D-02 / D-04: samples, steps and modules are tabs with one Tab stop and manual activation", () => {
  it("samples: a named tablist, the current sample holds the stop, each says 'muestra n de N'", () => {
    const html = renderToStaticMarkup(
      h(SampleTabs, {
        samples: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
        activeIndex: 1,
        onSelect: () => {},
        header: "Muestras",
        orientation: "horizontal",
        positionTemplate: "muestra {n} de {total}",
      }),
    );
    expect(html).toMatch(/role="tablist" aria-label="Muestras"/);
    expect(tabStops(html)).toBe(1);
    expect(html).toMatch(/aria-selected="true" tabindex="0"/);
    expect(html).toContain("muestra 2 de 3");
  });
  it("steps: 'paso n de N', and the notes and the send are the last, non-interactive steps", () => {
    const html = renderToStaticMarkup(
      h(PhaseStepper, {
        phases: ["a", "b"],
        currentPhase: "a",
        phaseStatuses: {},
        labels: { a: "Uno", b: "Dos" },
        onSelect: () => {},
        ariaLabel: "Pasos de la cata",
        stepOfTemplate: "paso {n} de {total}",
        trailing: ["Notas", "Enviar"],
      }),
    );
    expect(html).toMatch(/role="tablist" aria-label="Pasos de la cata"/);
    expect(tabStops(html)).toBe(1);
    expect(html).toContain("paso 1 de 4");
    expect(html).toContain("4. Enviar");
    expect((html.match(/aria-disabled="true"/g) ?? []).length).toBe(2);
  });
  it("the arrows only move the focus: selecting is the button's own click (each move flushes)", () => {
    for (const f of ["components/ui/SampleTabs.tsx", "components/cupping/PhaseStepper.tsx", "components/ui/ModuleSwitcher.tsx"]) {
      const src = read(f);
      const handler = src.slice(src.indexOf("const onKeyDown"), src.indexOf("};", src.indexOf("const onKeyDown")));
      expect(handler, f).toMatch(/refs\.current\[next\]\?\.focus\(\)/);
      expect(handler, f).not.toMatch(/onSelect|onChange/);
    }
  });
  it("modules: the panels are tabs; the action that leaves the page is not", () => {
    const html = renderToStaticMarkup(
      h(ModuleSwitcher, {
        modules: [
          { key: "cupping", label: "Evaluación", icon: null },
          { key: "results", label: "Resultados", icon: null, isAction: true },
        ],
        activeKey: "cupping",
        onSelect: () => {},
        header: "Evaluación",
      }),
    );
    const list = html.slice(html.indexOf('role="tablist"'), html.indexOf("</ul>"));
    expect(list).toContain("Evaluación");
    expect(list).not.toContain("Resultados");
    expect(html).toContain("Resultados");
  });
});

describe("D-01: the place in the address and the language switch", () => {
  it("the language switch is the same cup page in the other language, with the query kept", () => {
    expect(cupExitHref("es", "s1", "language", "?sample=a&step=2")).toBe("/en/app/sessions/s1/cup?sample=a&step=2");
    expect(cupExitHref("en", "s1", "language", "?sample=a&step=2")).toBe("/app/sessions/s1/cup?sample=a&step=2");
    // the other ways out ignore the query, as before
    expect(cupExitHref("es", "s1", "sessions", "?sample=a")).toBe("/es/app/sessions");
    expect(cupExitHref("es", "s1", "results", "?sample=a")).toBe("/es/app/sessions/s1/results");
  });
  it("CupClient writes the place FROM its state, reads it once, and keeps the back trap as it was", () => {
    const src = read("app/[locale]/app/sessions/[id]/cup/CupClient.tsx");
    expect(src).toMatch(/useState<CuppingStep>\(\s*stepsForFormat\[cupStepIndexFrom\(initialStep, stepsForFormat\.length\)\],?\s*\)/);
    // the write goes through lib/cupPlace.ts, which never hands Next's own state back
    // (the phone bug: the router kept the old URL and its refresh wrote it back)
    expect(src).toMatch(/writePlaceToHistory\(window, sampleId, stepIdx\)/);
    expect(src).not.toMatch(/history\.replaceState\(/);
    expect(src).toMatch(/writePlaceToAddress\(placeSampleId, placeStepIdx\);\s*\}, \[placeSampleId, placeStepIdx\]\);/);
    // the back trap is untouched: it still pushes its sentinel at mount and on every popstate
    expect(src.match(/window\.history\.pushState\(\{ cataCupSentinel: true \}, ""\);/g)).toHaveLength(2);
    // the language switch goes through the guard's own flush
    expect(src).toContain('requestLeave("language")');
    expect(src.match(/router\.push\(cupExitHref\(locale, session\.id, target, window\.location\.search\)\)/g)).toHaveLength(2);
  });
  it("the page reads the step once, as it reads the sample", () => {
    const page = read("app/[locale]/app/sessions/[id]/cup/page.tsx");
    expect(page).toContain("const { sample: initialSampleId, step: initialStep } = await searchParams;");
    expect(page).toContain("initialStep={initialStep}");
  });
});

describe("B-03: the cup page has one h1, visually hidden", () => {
  it("names the session", () => {
    const src = read("app/[locale]/app/sessions/[id]/cup/CupClient.tsx");
    expect(src.match(/<h1\b/g)).toHaveLength(1);
    expect(src).toContain('<h1 className="sr-only">{session.name}</h1>');
  });
});
