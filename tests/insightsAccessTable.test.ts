import { describe, expect, it } from "vitest";
import { readSource as read } from "./helpers/sourceTree";

// S10 (finding D-13 of the 2026-11-15 audit): the analytics access list is the
// kit's DataTable (search, pagination) instead of one list 26,722 px tall. The
// page, its gate, its data and the switch's behaviour are unchanged.

const comp = read("components/insights/AccessManager.tsx");
const page = read("app/[locale]/app/insights/access/page.tsx");

describe("S10: the access list is the kit's DataTable", () => {
  it("renders DataTable with search over the name and the address, a page at a time", () => {
    expect(comp).toContain('import { DataTable, type Column } from "@/components/ui/DataTable";');
    expect(comp).toMatch(/<DataTable\b/);
    expect(comp).toContain("searchText={(u) => [u.displayName, u.email]}");
    expect(comp).toMatch(/const PER_PAGE = 25;/);
    expect(comp).toContain("perPage={PER_PAGE}");
    // The search keeps its own words ("Buscar por nombre o correo…").
    expect(comp).toContain("translations={{ searchPlaceholder: t.search, ...t.table }}");
    // No hand-made list or search field left.
    expect(comp).not.toMatch(/<ul\b|type="search"/);
  });

  it("keeps one switch per person: role, state, the 44 px box, the visible label that names it, disabled for the super-admin", () => {
    expect(comp).toContain('role="switch"');
    expect(comp).toContain("aria-checked={on}");
    expect(comp).toContain("disabled={user.isSuperAdmin}");
    expect(comp).toContain("min-h-[44px] min-w-[44px]");
    expect(comp).toMatch(/<label className="[^"]*">\s*\{\/\*[\s\S]*?\*\/\}\s*<span className="text-xs text-on-surface-variant max-sm:sr-only">\{t\.accessLabel\}<\/span>\s*<button/);
  });

  it("keeps the same result handling: optimistic flip, the ActionResult, flip back and the person's error line", () => {
    expect(comp).toMatch(/const result = await setAnalyticsAccess\(user\.userId, next\);\s*if \(!result\.ok\) throw new Error\(result\.error\);/);
    expect(comp).toMatch(/catch \{\s*setUsers\(\(prev\) =>[\s\S]*?analyticsAccess: !next[\s\S]*?setErrorId\(user\.userId\);/);
    expect(comp).toContain("{t.toggleError}");
  });

  it("the page: still super-admin only, still one listAnalyticsUsers() call, the rows passed as before", () => {
    expect(page).toMatch(/if \(!access\?\.isSuperAdmin\) notFound\(\);/);
    expect(page.match(/listAnalyticsUsers\(\)/g)).toHaveLength(1);
    expect(page).toMatch(/<AccessManager\s+users=\{users\}\s+locale=\{locale\}/);
    // Only copy strings were added to the props (the kit's controls and three headers).
    expect(page).toContain('colName: tu("colName")');
    expect(page).toContain('showing: tc.raw("showing")');
  });
});
