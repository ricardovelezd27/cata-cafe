import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readSource as read } from "./helpers/sourceTree";
import { formControls, labelTargets } from "./helpers/formControls";

// Package N2 (UI/UX audit of 2026-11-15): the group pages name every control by
// its VISIBLE label (as N1 did for the coffee form), every icon-only button says
// what it does and to whom, and the controls of these pages paint 44 px or keep
// their look with a 44 px hit area (T7's rule, components/ui/hitArea.ts).

/** Every component file the two group pages render. */
const GROUP_FILES = [
  "components/groups/AddByEmailForm.tsx",
  "components/groups/AddToGroupButton.tsx",
  "components/groups/CreateGroupDialog.tsx",
  "components/groups/GroupEmailComposer.tsx",
  "components/groups/GroupFeed.tsx",
  "components/groups/GroupNameControls.tsx",
  "components/groups/MemberList.tsx",
  "components/groups/PostComposer.tsx",
  // N3: the session wizard's "notify the group" panel, kept in this folder.
  "components/groups/NotifyGroupPanel.tsx",
];

/** Controls named by an aria-label instead of a visible <label>, with the reason. */
const ARIA_NAMED: Record<string, string> = {
  // The select's own visible text is "Añadir a grupo"; its name begins with it
  // and adds whom it adds ("Añadir a grupo: {name}"). A visible label would repeat it.
  "components/groups/AddToGroupButton.tsx": "t.addToGroupNamed",
};

describe("N2: every control of the group pages is named by its visible label", () => {
  for (const file of GROUP_FILES) {
    it(file, () => {
      const src = read(file);
      const found = formControls(src);
      expect(found.length, `${file} has controls`).toBeGreaterThan(0);
      const targets = labelTargets(src);
      for (const c of found) {
        const where = `${file}: <${c.tag}> at ${c.at}`;
        if (c.checkbox) {
          // A checkbox is named by the <label> that wraps it (its visible text).
          expect(c.wrappedByLabel, `${where} sits inside its label`).toBe(true);
          continue;
        }
        if (c.ariaExpr && ARIA_NAMED[file] && c.ariaExpr.includes(ARIA_NAMED[file])) continue;
        expect(c.idExpr, `${where} has an id`).not.toBeNull();
        expect(c.idExpr, `${where}: the id comes from useId`).toContain("uid");
        expect(targets.has(c.idExpr!), `${where}: a label has htmlFor={${c.idExpr}}`).toBe(true);
      }
      expect(src, `${file} makes its ids with useId`).toMatch(/const uid = useId\(\)/);
    });
  }

  it("the sections of the create dialog are groups named by their visible title", () => {
    const src = read("components/groups/CreateGroupDialog.tsx");
    for (const g of ["members", "quick-add"]) {
      expect(src).toContain(`<p id={\`\${uid}-${g}\`}`);
      expect(src).toContain(`role="group" aria-labelledby={\`\${uid}-${g}\`}`);
    }
  });
});

describe("N2: every icon-only button says what it does and to whom", () => {
  const cases: [string, string[]][] = [
    ["components/groups/MemberList.tsx", [
      "aria-label={named(t.saveNamed, m)}",
      "aria-label={named(t.cancelNamed, m)}",
      "aria-label={named(t.resendNamed, m)}",
      "aria-label={named(t.editNameNamed, m)}",
      "aria-label={named(t.removeNamed, m)}",
    ]],
    ["components/groups/GroupFeed.tsx", [
      'aria-label={t.editNamed.replace("{title}", postLabel(post))}',
      'aria-label={t.deleteNamed.replace("{title}", postLabel(post))}',
    ]],
    ["components/groups/QuickAddCoCuppers.tsx", ['aria-label={t.addNamed.replace("{name}", c.displayName)}']],
    ["components/groups/CreateGroupDialog.tsx", ['aria-label={t.removeRowNamed.replace("{n}", String(i + 1))}']],
    ["components/groups/GroupNameControls.tsx", ["aria-label={t.editDetails}"]],
  ];
  for (const [file, labels] of cases) {
    it(file, () => {
      const src = read(file);
      for (const l of labels) expect(src, l).toContain(l);
    });
  }

  it("the roster names a member by what the owner's roster already shows, never another field", () => {
    const src = read("components/groups/MemberList.tsx");
    expect(src).toContain('template.replace("{name}", m.displayName || m.email)');
  });

  it("each new template exists in both languages and keeps its placeholder", () => {
    const keys: [string, string][] = [
      ["memberEdit.removeNamed", "{name}"],
      ["memberEdit.editNameNamed", "{name}"],
      ["memberEdit.resendNamed", "{name}"],
      ["memberEdit.saveNamed", "{name}"],
      ["memberEdit.cancelNamed", "{name}"],
      ["memberEdit.nameLabelNamed", "{name}"],
      ["feed.editNamed", "{title}"],
      ["feed.deleteNamed", "{title}"],
      ["quickAddNamed", "{name}"],
      ["addToGroupNamed", "{name}"],
      ["removeRowNamed", "{n}"],
      ["emailLabel", ""],
      ["feed.titleLabel", ""],
      ["feed.bodyLabel", ""],
    ];
    for (const lang of ["es", "en"]) {
      const groups = JSON.parse(readFileSync(path.resolve(__dirname, "..", `messages/${lang}.json`), "utf8")).groups;
      for (const [key, ph] of keys) {
        const value = key.split(".").reduce((o: Record<string, unknown>, k) => o?.[k] as Record<string, unknown>, groups) as unknown;
        expect(typeof value, `${lang}: groups.${key}`).toBe("string");
        if (ph) expect(value as string, `${lang}: groups.${key}`).toContain(ph);
      }
    }
  });
});

describe("N2: the group pages' controls paint 44 px or carry a 44 px hit area", () => {
  it("no rem-based 44 (h-11 / w-11 paint 38.5 px on this app's 14 px root)", () => {
    for (const file of [...GROUP_FILES, "components/groups/QuickAddCoCuppers.tsx"]) {
      expect(read(file), file).not.toMatch(/\b(?:h|w|min-h|min-w)-11\b/);
    }
  });

  it("the roster's side-by-side icon buttons keep their size with a 44 px tall hit area (HIT_Y44)", () => {
    const src = read("components/groups/MemberList.tsx");
    expect((src.match(/\$\{HIT_Y44\} p-1\.5/g) ?? []).length).toBe(5);
  });

  it("the lone icon buttons in a row carry a 44 x 44 hit area (HIT_44)", () => {
    expect(read("components/groups/QuickAddCoCuppers.tsx")).toContain("${HIT_44} p-1.5");
    expect(read("components/groups/CreateGroupDialog.tsx")).toContain("${HIT_44} shrink-0");
  });

  it("the owner's back link and 'create a session' link paint 44 px", () => {
    const page = read("app/[locale]/app/groups/[id]/page.tsx");
    expect(page).toContain('className="inline-flex min-h-[44px] w-fit items-center gap-1 text-sm text-on-surface-variant');
    expect(page).toContain('className="inline-flex min-h-[44px] items-center gap-1.5 rounded-pill bg-primary-container px-4 py-2');
  });

  it("the text buttons of the composers, the roster form and the dialogs paint 44 px", () => {
    const want: [string, number][] = [
      ["components/groups/PostComposer.tsx", 2], // title field, Publicar
      ["components/groups/AddByEmailForm.tsx", 2], // the fields' class, Añadir integrante
      ["components/groups/GroupEmailComposer.tsx", 4], // subject, session select, Enviar, retry
      ["components/groups/GroupNameControls.tsx", 3], // name field, save, Eliminar grupo
      ["components/groups/LeaveGroupButton.tsx", 1],
      ["components/groups/GroupEmailOptOutNotice.tsx", 1],
    ];
    for (const [file, n] of want) {
      expect((read(file).match(/min-h-\[44px\]/g) ?? []).length, file).toBeGreaterThanOrEqual(n);
    }
  });
});
