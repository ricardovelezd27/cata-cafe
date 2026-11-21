import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// The editor needs the app router and the toast provider: neither exists in a server render.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useActionFeedback: () => ({ run: async () => {}, notifyError: () => {}, notifySuccess: () => {} }),
}));
vi.mock("@/app/actions/community", () => ({ setSessionReflection: async () => ({ ok: true }) }));

import { Reflection, type ReflectionStrings } from "@/components/results/Reflection";
import {
  SESSION_REFLECTION_MAX,
  buildReflections,
  normalizeReflection,
  ownerNotesBlock,
  reflectionAllowed,
} from "@/lib/sessionReflection";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

// OR-D (the owner's review of 2026-11-21): ONE reflection per tasting and person,
// written after the close. It replaced the note per coffee; the notes written
// before stay stored and are shown read-only. A tasting has one kind or the other.

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const at = new Date("2026-11-21T10:00:00Z");

describe("the text", () => {
  it("trims, empty clears, at most 500 characters, text only", () => {
    expect(SESSION_REFLECTION_MAX).toBe(500);
    expect(normalizeReflection("  hola  ")).toBe("hola");
    expect(normalizeReflection("")).toBeNull();
    expect(normalizeReflection("   ")).toBeNull();
    expect(normalizeReflection("x".repeat(500))).toHaveLength(500);
    expect(() => normalizeReflection("x".repeat(501))).toThrow("invalid_input");
    expect(() => normalizeReflection(7)).toThrow("invalid_input");
  });
});

describe("who may write one", () => {
  it("a closed session, at least one evaluation sent, and no note per coffee in the tasting", () => {
    expect(reflectionAllowed({ sessionStatus: "closed", sentEvaluations: 1, coffeeNotes: 0 })).toBe(true);
    expect(reflectionAllowed({ sessionStatus: "active", sentEvaluations: 1, coffeeNotes: 0 })).toBe(false);
    expect(reflectionAllowed({ sessionStatus: "closed", sentEvaluations: 0, coffeeNotes: 0 })).toBe(false);
    // a tasting from before the reflection keeps its notes per coffee and takes no reflection
    expect(reflectionAllowed({ sessionStatus: "closed", sentEvaluations: 3, coffeeNotes: 1 })).toBe(false);
  });
});

describe("who reads one (buildReflections)", () => {
  const rows = [
    { userId: "me", text: "la mía", writtenAt: at },
    { userId: "other", text: "secreto", writtenAt: at },
  ];
  const base = { sessionStatus: "closed", viewerId: "me", viewerSent: 2, coffeeNotes: 0, rows };

  it("a participant gets their own and nobody else's, whatever rows are passed", () => {
    const p = buildReflections({ ...base, organizer: false });
    expect(p).toEqual({ mine: { text: "la mía", at: at.toISOString() }, byCupper: null });
    expect(JSON.stringify(p)).not.toContain("secreto");
  });

  it("the organizer also gets everyone else's, by cupper", () => {
    const p = buildReflections({ ...base, organizer: true });
    expect(p.mine).toEqual({ text: "la mía", at: at.toISOString() });
    expect(p.byCupper).toEqual({ other: { text: "secreto", at: at.toISOString() } });
  });

  it("not written yet is an empty editor; no evaluation sent, or notes per coffee, is no editor", () => {
    expect(buildReflections({ ...base, organizer: false, rows: [] }).mine).toEqual({ text: null, at: null });
    expect(buildReflections({ ...base, organizer: false, viewerSent: 0 }).mine).toBeNull();
    expect(buildReflections({ ...base, organizer: true, coffeeNotes: 2 }).mine).toBeNull();
  });

  it("nothing before the close", () => {
    expect(buildReflections({ ...base, organizer: true, sessionStatus: "active" })).toEqual({ mine: null, byCupper: null });
  });
});

describe("the organizer's one notes block", () => {
  const names = { u1: "Ana", u2: "Bruno" };
  const labels = { a: "Muestra A", b: "Muestra B" };
  const note = (text: string) => ({ text, at: at.toISOString() });

  it("the reflections, one per person, by name", () => {
    const block = ownerNotesBlock({
      coffeeNotes: {},
      reflections: { u2: note("de Bruno"), u1: note("de Ana") },
      cupperNames: names,
      sampleLabels: labels,
    });
    expect(block?.kind).toBe("reflection");
    expect(block?.items.map((i) => [i.heading, i.text])).toEqual([
      ["Ana", "de Ana"],
      ["Bruno", "de Bruno"],
    ]);
  });

  it("a tasting from before the reflection: its notes per coffee, as they are", () => {
    const block = ownerNotesBlock({
      coffeeNotes: { u2: { b: note("B de Bruno") }, u1: { b: note("B de Ana"), a: note("A de Ana") } },
      reflections: null,
      cupperNames: names,
      sampleLabels: labels,
    });
    expect(block?.kind).toBe("coffee");
    expect(block?.items.map((i) => i.heading)).toEqual(["Ana · Muestra A", "Ana · Muestra B", "Bruno · Muestra B"]);
  });

  it("never two lists, and nothing when nobody else wrote", () => {
    const both = ownerNotesBlock({
      coffeeNotes: { u1: { a: note("vieja") } },
      reflections: { u2: note("nueva") },
      cupperNames: names,
      sampleLabels: labels,
    });
    expect(both?.kind).toBe("coffee");
    expect(both?.items).toHaveLength(1);
    expect(ownerNotesBlock({ coffeeNotes: null, reflections: null, cupperNames: names, sampleLabels: labels })).toBeNull();
    expect(ownerNotesBlock({ coffeeNotes: {}, reflections: {}, cupperNames: names, sampleLabels: labels })).toBeNull();
  });
});

describe("on the page", () => {
  const strings = (m: typeof es): ReflectionStrings => ({ ...m.results.reflection, oldDated: m.results.postCloseNote.added });
  const base = { sessionId: "s1", locale: "es", userId: "u1", t: strings(es), oldNotes: [] };

  it("one text area for the whole tasting, and who reads it", () => {
    const group = renderToStaticMarkup(createElement(Reflection, { ...base, mine: { text: null, at: null }, onlyReader: false }));
    expect((group.match(/<textarea/g) ?? []).length).toBe(1);
    expect(group).toContain('maxLength="500"');
    expect(group).toContain(es.results.reflection.title);
    expect(group).toContain(es.results.reflection.who);
    expect(group).not.toMatch(/<h3/); // not one per coffee
    const solo = renderToStaticMarkup(createElement(Reflection, { ...base, mine: { text: null, at: null }, onlyReader: true }));
    expect(solo).toContain(es.results.reflection.whoSolo);
    expect(solo).not.toContain(es.results.reflection.who);
  });

  it("a saved reflection is shown with its date, to edit or delete", () => {
    const saved = renderToStaticMarkup(
      createElement(Reflection, { ...base, mine: { text: "Aprendí a oler antes de probar.", at: at.toISOString() }, onlyReader: false }),
    );
    expect(saved).toContain("Aprendí a oler antes de probar.");
    expect(saved).not.toContain("<textarea");
    expect(saved).toContain(es.results.reflection.edit);
    expect(saved).toContain(es.results.reflection.remove);
  });

  it("a tasting from before it: the reader's own notes per coffee, read-only, and no editor", () => {
    const old = renderToStaticMarkup(
      createElement(Reflection, {
        ...base,
        mine: null,
        oldNotes: [{ id: "a", label: "Muestra A", name: "Ámbar", text: "más dulce al enfriar", at: at.toISOString() }],
        onlyReader: false,
      }),
    );
    expect(old).toContain(es.results.reflection.oldTitle);
    expect(old).toContain("más dulce al enfriar");
    expect(old).not.toMatch(/<textarea|<button/);
    // nothing to write and nothing written: no section
    expect(renderToStaticMarkup(createElement(Reflection, { ...base, mine: null, onlyReader: false }))).toBe("");
  });

  it("the words exist in both languages, with the same keys", () => {
    expect(Object.keys(en.results.reflection)).toEqual(Object.keys(es.results.reflection));
    expect(Object.keys(es.results.postCloseNote)).toEqual(["added", "ownerTitle", "ownerIntro"]);
    expect(Object.keys(en.results.postCloseNote)).toEqual(["added", "ownerTitle", "ownerIntro"]);
    expect(strings(en).title).toBe("Your reflection on this tasting");
  });
});

describe("the per-coffee editors are gone, the old notes stay readable", () => {
  const client = read("app", "[locale]", "app", "sessions", "[id]", "results", "ResultsClient.tsx");
  const page = read("app", "[locale]", "app", "sessions", "[id]", "results", "page.tsx");
  const actions = read("app", "actions", "community.ts");

  it("nothing writes a note per coffee any more", () => {
    expect(actions).not.toMatch(/export async function setPostCloseNote/);
    expect(actions).not.toMatch(/data: \{ postCloseNote/);
    expect(actions).toMatch(/export async function setSessionReflection/);
    expect(read("components", "results", "PostCloseNote.tsx")).not.toMatch(/textarea|setPostCloseNote|PostCloseNoteEditor/);
  });

  it("the sheet has no note slot; the reflection is drawn once, in \"Por café\"", () => {
    expect(client).not.toMatch(/PostCloseNoteEditor|extra=\{/);
    expect(read("components", "results", "SampleDetailDialog.tsx")).not.toMatch(/\bextra\b/);
    expect(client.match(/<Reflection\b/g)).toHaveLength(1);
    // never in the admin's lens, only on a closed session
    expect(client).toMatch(/\{sessionClosed && !isAdminViewer \? \(\s*<Reflection/);
  });

  it("the page reads the viewer's own row, and every row only for the organizer; none in the admin's lens", () => {
    expect(page).toMatch(/const reflectionsOpen = !isAdminViewer && session\.status === "closed";/);
    expect(page).toMatch(/where: \{ sessionId: id, \.\.\.\(isOwner \? \{\} : \{ userId: user\.id \}\) \}/);
    expect(page).toMatch(/const reflections = isAdminViewer\s*\? null\s*: buildReflections\(/);
    expect(page.match(/prisma\.sessionReflection\./g)).toHaveLength(1);
  });

  it("the old notes are still stored and read: the column and its reader are untouched", () => {
    expect(read("prisma", "schema.prisma")).toMatch(/postCloseNote\s+String\?/);
    expect(page).toContain("buildPostCloseNotes(");
    expect(existsSync(path.join(process.cwd(), "prisma", "migrations", "20261121090000_session_reflections", "migration.sql"))).toBe(true);
    // the migration only adds the new table: it copies, changes and drops nothing
    const migration = read("prisma", "migrations", "20261121090000_session_reflections", "migration.sql")
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith("--"))
      .join(" ");
    expect(migration).not.toMatch(/\bDROP\b|\bDELETE FROM\b|\bINSERT\b|\bUPDATE\s+"|"evaluations"/);
  });

  it("no report, export, analytics query or AI prompt reads the reflections", () => {
    const allowed = new Set([
      "app/actions/community.ts",
      "app/[locale]/app/sessions/[id]/results/page.tsx",
      "lib/accountDeletion/deleteAccount.ts",
      "lib/guestClaim.ts",
    ]);
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (rel === "app/generated") continue;
          walk(rel);
        } else if (/\.(ts|tsx)$/.test(entry.name) && /\.sessionReflection\.|session_reflections/.test(read(rel))) {
          hits.push(rel);
        }
      }
    };
    for (const dir of ["app", "lib", "components", "hooks"]) walk(dir);
    expect(hits.filter((h) => !allowed.has(h) && h !== "lib/unusedAccountRules.ts")).toEqual([]);
  });
});
