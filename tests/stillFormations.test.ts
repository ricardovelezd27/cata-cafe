import { describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Clipboard, Coffee, Star, UserPlus, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Formation } from "@/components/ui/Formation";
import { BOWL_RINGS, WHEEL_FAMILIES, WHEEL_RINGS, stillFormation, type FormationKind } from "@/lib/canvas/shapes";

// Audit K-03: the empty states draw a still formation of the landing's own
// shapes, on paper, in place of an icon in a circle.

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const html = (el: ReactElement) => renderToStaticMarkup(el);
const KINDS: FormationKind[] = ["bowls", "wheel", "gathering"];

describe("the shapes stay the landing's", () => {
  it("the constellation's builders take their rings from the shared module", () => {
    const landing = read("components/landing/journey/formations.ts");
    expect(landing).toContain('from "@/lib/canvas/shapes"');
    expect(landing).toContain("const rings = BOWL_RINGS;");
    expect(landing).toContain("let rings: readonly number[] = WHEEL_RINGS;");
    expect(landing).toContain("% WHEEL_FAMILIES");
    // the numbers the landing was built with
    expect([...BOWL_RINGS]).toEqual([0.34, 0.66, 1]);
    expect([...WHEEL_RINGS]).toEqual([0.42, 0.7, 1]);
    expect(WHEEL_FAMILIES).toBe(9);
  });

  it("the bowls: three bowls, each with dots on the three rings at the landing's ratios", () => {
    const f = stillFormation("bowls");
    const centres: [number, number][] = [
      [22, 44],
      [60, 28],
      [98, 44],
    ];
    const radii = centres.map(([cx, cy]) =>
      [...new Set(f.dots.map((d) => Math.round(Math.hypot(d.x - cx, d.y - cy) * 10) / 10))].filter((r) => r <= 14.1).sort((a, b) => a - b),
    );
    for (const r of radii) {
      const ratios = r.map((v) => Math.round((v / 14) * 100) / 100);
      for (const ring of BOWL_RINGS) expect(ratios).toContain(ring);
    }
  });

  it("the wheel: dots on the three rings, and all nine families present", () => {
    const f = stillFormation("wheel");
    const rings = [...new Set(f.dots.map((d) => Math.round((Math.hypot(d.x - 40, d.y - 40) / 32) * 100) / 100))].sort();
    expect(rings).toEqual([...WHEEL_RINGS]);
    expect(f.dots.some((d) => d.tone === "accent")).toBe(true);
  });

  it("every dot is inside its box", () => {
    for (const k of KINDS) {
      const f = stillFormation(k);
      for (const d of f.dots) {
        expect(d.x - d.r, k).toBeGreaterThanOrEqual(0);
        expect(d.y - d.r, k).toBeGreaterThanOrEqual(0);
        expect(d.x + d.r, k).toBeLessThanOrEqual(f.width);
        expect(d.y + d.r, k).toBeLessThanOrEqual(f.height);
      }
    }
  });
});

describe("on paper, still and decorative", () => {
  it("is an aria-hidden SVG in the paper tokens, with nothing that moves", () => {
    for (const k of KINDS) {
      const svg = html(createElement(Formation, { kind: k }));
      expect(svg).toMatch(/^<svg[^>]*aria-hidden="true"/);
      expect(svg).toContain('focusable="false"');
      expect(svg).not.toMatch(/animate|<script|#[0-9a-fA-F]{3,8}/);
    }
    const src = read("components/ui/Formation.tsx");
    expect(src).toContain('ink: "fill-primary-container"');
    expect(src).toContain('soft: "fill-primary-muted"');
    expect(src).toContain('accent: "fill-secondary"');
    expect(src).not.toMatch(/<canvas|getContext|color-stage|bg-stage|"use client"/);
  });

  it("is visible on paper: the ink and the accent 3 : 1 or more; the soft ink is a lighter dot, still seen", () => {
    const globals = read("app/globals.css");
    const token = (name: string): number[] => {
      const m = globals.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
      if (!m) throw new Error(name);
      return [1, 3, 5].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    };
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const ground of [token("surface"), token("surface-container-lowest")]) {
      expect(contrast(token("primary-container"), ground)).toBeGreaterThanOrEqual(3);
      expect(contrast(token("secondary"), ground)).toBeGreaterThanOrEqual(3);
      expect(contrast(token("primary-muted"), ground)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("EmptyState draws one, and every existing call still works", () => {
  const shapeOf = (markup: string) => markup.match(/data-empty-formation="([a-z]+)"/)?.[1] ?? null;
  it("a page may name the shape", () => {
    for (const k of KINDS) expect(shapeOf(html(createElement(EmptyState, { formation: k, title: "T" })))).toBe(k);
  });
  it("without the prop, the icon the page passes picks it: sessions and the dashboard (a cup, a clipboard), groups and people", () => {
    expect(shapeOf(html(createElement(EmptyState, { icon: createElement(Coffee, { size: 20 }), title: "T" })))).toBe("bowls");
    expect(shapeOf(html(createElement(EmptyState, { icon: createElement(Clipboard, { size: 20 }), title: "T" })))).toBe("bowls");
    expect(shapeOf(html(createElement(EmptyState, { icon: createElement(Users, { size: 20 }), title: "T" })))).toBe("gathering");
    expect(shapeOf(html(createElement(EmptyState, { icon: createElement(UserPlus, { size: 20 }), title: "T" })))).toBe("gathering");
  });
  it("any other icon keeps the icon in a circle; no icon, no picture; `formation={false}` keeps the icon", () => {
    const other = html(createElement(EmptyState, { icon: createElement(Star, { size: 20 }), title: "T" }));
    expect(shapeOf(other)).toBeNull();
    expect(other).toContain("rounded-pill bg-surface-container");
    const none = html(createElement(EmptyState, { title: "T", body: "B" }));
    expect(none).not.toMatch(/<svg/);
    expect(shapeOf(html(createElement(EmptyState, { icon: createElement(Coffee), formation: false, title: "T" })))).toBeNull();
  });
  it("the title, the body and the action are where they were", () => {
    const m = html(createElement(EmptyState, { formation: "wheel", title: "Título", body: "Cuerpo", action: createElement("button", null, "Crear") }));
    expect(m.indexOf("data-empty-formation")).toBeLessThan(m.indexOf("<h3"));
    expect(m).toContain('<h3 class="text-card">Título</h3>');
    expect(m).toContain("Cuerpo");
    expect(m).toContain("<button>Crear</button>");
  });
});
