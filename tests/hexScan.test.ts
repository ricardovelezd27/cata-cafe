import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readSource as read, walkSource } from "./helpers/sourceTree";
import { SCAN_TIMEOUT_MS } from "./helpers/timeouts";

// T5 (finding E-01 of the 2026-11-15 audit): no hex literal in a component.
// The app paints with the role tokens of app/globals.css. This scan fails on a
// hex colour in `app`, `components` or `hooks` outside the explicit lists
// below, which may only SHRINK: an entry whose file or folder no longer holds a
// hex fails too, so it is removed instead of kept. `lib/pdf/**` is outside the
// scan on purpose (react-pdf draws raw colours; DESIGN.md sanctions it).

/** Paths (file or folder) that may hold hex, and why. */
const ALLOWLIST: Record<string, string> = {
  "app/globals.css": "the tokens are defined here",
  "components/results/chartColors.ts": "Recharts' SSR snapshot of the tokens (tests/insightsTokens.test.ts checks it equals them)",
  "components/landing": "the landing's constellation canvas keeps a snapshot of the stage tokens (DESIGN.md sanctions it)",
  "components/warmup": "the warm-up's stage field draws the same particle dialect on the stage",
  "app/[locale]/app/sessions/[id]/print/PrintClient.tsx":
    "the printed CVA sheet: its ink, rules, cream, green and red are the paper's colours and mirror lib/pdf's document palette; a screen token would change the printed sheet",
  "components/auth/GoogleMark.tsx": "Google's brand colours, required as they are",
  "app/[locale]/dev": "dev-only pages; they never ship to users",
  "components/dev": "dev-only badges; they never ship to users",
  // Files that MUST be literal (a manifest, an image route, a canvas or QR, an
  // email's inline styles) and so keep hex, each EQUAL to a token's value
  // (checked below).
  "app/manifest.ts": "a web app manifest takes literal colours",
  "app/[locale]/opengraph-image.tsx": "an image route draws literal colours",
  "components/ui/InviteQR.tsx": "the QR code and the image copied from it need literal colours",
  "app/actions/groups.ts": "an email's inline styles need literal colours",
};

const MUST_EQUAL_A_TOKEN = [
  "app/manifest.ts",
  "app/[locale]/opengraph-image.tsx",
  "components/ui/InviteQR.tsx",
  "app/actions/groups.ts",
];

// A colour: 3, 4, 6 or 8 hex digits after "#", not an HTML entity or an id
// in a word, and not inside a comment (a "PR #119" in a comment is no colour).
const HEX = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g;

function hexesIn(text: string): { line: number; hex: string }[] {
  const out: { line: number; hex: string }[] = [];
  let inBlock = false;
  text.split("\n").forEach((raw, i) => {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) return;
      line = line.slice(end + 2);
      inBlock = false;
    }
    // Strip block comments that open on this line, and a trailing // comment.
    line = line.replace(/\/\*.*?\*\//g, "");
    const open = line.indexOf("/*");
    if (open !== -1) {
      inBlock = true;
      line = line.slice(0, open);
    }
    const slashes = line.search(/(^|[^:"'`])\/\//);
    if (slashes !== -1) line = line.slice(0, slashes + 1);
    if (/^\s*\*/.test(raw) && !inBlock) return;
    for (const m of line.matchAll(HEX)) out.push({ line: i + 1, hex: m[0] });
  });
  return out;
}

const SKIP = new Set(["node_modules", ".next", "generated"]);
const files = ["app", "components", "hooks"].flatMap((root) =>
  walkSource(root, `hex-${root}`, { include: /\.(tsx?|css)$/, skip: (n: string, d: boolean) => d && SKIP.has(n) }),
);
const allowed = (rel: string) => Object.keys(ALLOWLIST).some((p) => rel === p || rel.startsWith(`${p}/`));

/** Token values as app/globals.css writes them (`--color-x: #abcdef;`). */
function tokenValues(): Set<string> {
  const css = read("app/globals.css");
  return new Set([...css.matchAll(/--color-[a-z-]+:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => m[1].toLowerCase()));
}

describe("T5: no hex literal in a component (E-01)", () => {
  it("scans the app, the components and the hooks", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("no hex colour outside the allowlist", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (allowed(f)) continue;
      for (const h of hexesIn(read(f))) offenders.push(`${f}:${h.line} ${h.hex}`);
    }
    expect(offenders).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it("the allowlist only shrinks: every entry exists and still holds a hex", () => {
    for (const p of Object.keys(ALLOWLIST)) {
      expect(existsSync(join(process.cwd(), p)), p).toBe(true);
      const holders = files.filter((f) => f === p || f.startsWith(`${p}/`));
      const total = holders.reduce((n, f) => n + hexesIn(read(f)).length, 0);
      expect(total, `${p} holds no hex any more: remove it from the allowlist`).toBeGreaterThan(0);
    }
  }, SCAN_TIMEOUT_MS);

  it("a file that must be literal uses only the tokens' own values", () => {
    const tokens = tokenValues();
    const strays: string[] = [];
    for (const f of MUST_EQUAL_A_TOKEN) {
      for (const h of hexesIn(read(f))) {
        const v = h.hex.toLowerCase();
        const full = v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
        if (!tokens.has(full)) strays.push(`${f}:${h.line} ${h.hex}`);
      }
    }
    expect(strays).toEqual([]);
  });

  it("a comment's '#119' is not a colour, an entity is not a colour", () => {
    expect(hexesIn("// fixed in PR #119 and (#187)\nconst a = 1;")).toEqual([]);
    expect(hexesIn('const s = "&#8203;";')).toEqual([]);
    expect(hexesIn('const c = "#2c4c3b"; // the green')).toEqual([{ line: 1, hex: "#2c4c3b" }]);
  });
});
