// Splits a SQL script into statements, honouring '...' strings, "..." idents,
// -- and /* */ comments and $tag$ ... $tag$ dollar quotes (function bodies).
// Good enough for prisma/sql/rls_and_triggers.sql; not a general parser.

export function splitSql(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const e = sql.indexOf("\n", i);
      const end = e === -1 ? n : e;
      cur += sql.slice(i, end);
      i = end;
    } else if (two === "/*") {
      const e = sql.indexOf("*/", i + 2);
      const end = e === -1 ? n : e + 2;
      cur += sql.slice(i, end);
      i = end;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) j += 2;
          else break;
        } else j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
    } else if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const e = sql.indexOf(tag, i + tag.length);
        const end = e === -1 ? n : e + tag.length;
        cur += sql.slice(i, end);
        i = end;
      } else {
        cur += c;
        i++;
      }
    } else if (c === ";") {
      if (hasCode(cur)) out.push(cur.trim());
      cur = "";
      i++;
    } else {
      cur += c;
      i++;
    }
  }
  if (hasCode(cur)) out.push(cur.trim());
  return out;
}

function hasCode(s: string): boolean {
  return s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim().length > 0;
}
