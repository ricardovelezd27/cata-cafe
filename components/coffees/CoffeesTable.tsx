"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

type CoffeeRow = {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  variety: string | null;
  processType: string | null;
  isPublic: boolean;
  createdBy: string;
  isMine: boolean;
  ownerName?: string | null;
  _count: { sessionSamples: number };
  coffeeHistory: Array<{
    tastedAt: string;
    individualScore: number | null;
    communityScore: number | null;
  }>;
};

type SortField = "name" | "country" | "processType" | "variety" | "sessions" | "score" | "date";

type Props = {
  coffees: CoffeeRow[];
  locale: string;
  translations: {
    searchPlaceholder: string;
    colName: string;
    colOrigin: string;
    colProcess: string;
    colVariety: string;
    colSessions: string;
    colLastScore: string;
    colLastDate: string;
    noData: string;
    showing: string;
    view: string;
    listPublic: string;
    listPrivate: string;
    adminOwnerPrefix: string;
  };
  isAdmin?: boolean;
};

const PROCESS_COLORS: Record<string, string> = {
  Lavado: "#4A90D9",
  Natural: "#E8834A",
  Honey: "#C17817",
  Anaeróbico: "#8B5CF6",
  "Maceración Carbónica": "#8B5CF6",
  Láctico: "#7A6E5F",
  "Co-fermentación": "#7A6E5F",
  Otro: "#7A6E5F",
};

const PER_PAGE = 10;

function ProcessBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-brown-mid text-xs">—</span>;
  const bg = PROCESS_COLORS[type] ?? "#7A6E5F";
  return (
    <span
      style={{ background: bg, color: "#fff", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}
    >
      {type}
    </span>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-brown-mid">—</span>;
  const bg = score >= 85 ? "#3D5A3E" : score >= 75 ? "#C17817" : "#A83232";
  return (
    <span
      style={{ background: bg, color: "#fff", padding: "2px 10px", borderRadius: 999, fontSize: 13, fontWeight: 600 }}
    >
      {score.toFixed(2)}
    </span>
  );
}

function VisibilityPill({ isPublic, labelPublic, labelPrivate }: { isPublic: boolean; labelPublic: string; labelPrivate: string }) {
  const className = isPublic
    ? "bg-green-dark/10 text-green-dark border-green-dark/30"
    : "bg-cream text-brown-mid border-brown-light";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${className}`}>
      {isPublic ? labelPublic : labelPrivate}
    </span>
  );
}

function relativeDate(iso: string, locale: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 604800) return rtf.format(Math.round(diff / 86400), "day");
  if (abs < 2592000) return rtf.format(Math.round(diff / 604800), "week");
  if (abs < 31536000) return rtf.format(Math.round(diff / 2592000), "month");
  return rtf.format(Math.round(diff / 31536000), "year");
}

function SortIcon({ field, active, dir }: { field: string; active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span className="text-brown-light ml-1 text-xs">↕</span>;
  return <span className="text-green-dark ml-1 text-xs">{dir === "asc" ? "↑" : "↓"}</span>;
}

export default function CoffeesTable({ coffees, locale, translations: t, isAdmin = false }: Props) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return coffees;
    return coffees.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.country ?? "").toLowerCase().includes(q) ||
        (c.variety ?? "").toLowerCase().includes(q) ||
        (c.region ?? "").toLowerCase().includes(q)
    );
  }, [coffees, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "country":
          cmp = (a.country ?? "").localeCompare(b.country ?? "");
          break;
        case "processType":
          cmp = (a.processType ?? "").localeCompare(b.processType ?? "");
          break;
        case "variety":
          cmp = (a.variety ?? "").localeCompare(b.variety ?? "");
          break;
        case "sessions":
          cmp = a._count.sessionSamples - b._count.sessionSamples;
          break;
        case "score": {
          const sa = a.coffeeHistory[0]?.individualScore ?? -1;
          const sb = b.coffeeHistory[0]?.individualScore ?? -1;
          cmp = sa - sb;
          break;
        }
        case "date": {
          const da = a.coffeeHistory[0]?.tastedAt ?? "";
          const db = b.coffeeHistory[0]?.tastedAt ?? "";
          cmp = da.localeCompare(db);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = sorted.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
  const from = sorted.length === 0 ? 0 : (safePage - 1) * PER_PAGE + 1;
  const to = Math.min(safePage * PER_PAGE, sorted.length);

  const showingText = t.showing
    .replace("{from}", String(from))
    .replace("{to}", String(to))
    .replace("{total}", String(sorted.length));

  function Th({ field, label }: { field: SortField; label: string }) {
    return (
      <th
        className="px-4 py-3 text-left text-xs font-semibold text-brown-mid uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-brown-dark"
        onClick={() => handleSort(field)}
      >
        {label}
        <SortIcon field={field} active={sortField === field} dir={sortDir} />
      </th>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-mid pointer-events-none"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <circle cx={11} cy={11} r={8} />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder={t.searchPlaceholder}
          className="w-full pl-9 pr-4 py-2 text-sm border border-brown-light rounded-input bg-[#FDFBF7] text-brown-dark placeholder:text-brown-mid focus:outline-none focus:border-green-dark"
        />
      </div>

      {/* Desktop table */}
      {pageItems.length === 0 ? (
        <p className="text-sm text-brown-mid py-8 text-center">{t.noData}</p>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto rounded-card border border-brown-light">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F0E8] border-b border-brown-light">
                <tr>
                  <Th field="name" label={t.colName} />
                  <Th field="country" label={t.colOrigin} />
                  <Th field="processType" label={t.colProcess} />
                  <Th field="variety" label={t.colVariety} />
                  <Th field="sessions" label={t.colSessions} />
                  <Th field="score" label={t.colLastScore} />
                  <Th field="date" label={t.colLastDate} />
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-brown-light/50">
                {pageItems.map((c) => {
                  const latest = c.coffeeHistory[0] ?? null;
                  return (
                    <tr
                      key={c.id}
                      className="bg-[#FDFBF7] hover:bg-amber-50/40 transition-colors border-l-2 border-l-transparent hover:border-l-green-dark"
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <Link
                            href={`/${locale}/app/coffees/${c.id}`}
                            className="font-semibold text-brown-dark hover:text-green-dark"
                          >
                            {c.name}
                          </Link>
                          {(c.isMine || isAdmin) && (
                            <VisibilityPill
                              isPublic={c.isPublic}
                              labelPublic={t.listPublic}
                              labelPrivate={t.listPrivate}
                            />
                          )}
                        </span>
                        {c.ownerName && (
                          <span className="block text-xs text-brown-mid">
                            {t.adminOwnerPrefix} {c.ownerName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-brown-dark">
                        {c.country ? (
                          <span>
                            {c.country}
                            {c.region && (
                              <span className="block text-xs text-brown-mid">{c.region}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-brown-mid">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ProcessBadge type={c.processType} />
                      </td>
                      <td className="px-4 py-3 text-brown-dark">
                        {c.variety ?? <span className="text-brown-mid">—</span>}
                      </td>
                      <td className="px-4 py-3 text-brown-dark text-center">
                        {c._count.sessionSamples}
                      </td>
                      <td className="px-4 py-3">
                        <ScoreBadge score={latest?.individualScore ?? null} />
                      </td>
                      <td className="px-4 py-3 text-xs text-brown-mid whitespace-nowrap">
                        {latest ? relativeDate(latest.tastedAt, locale) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/${locale}/app/coffees/${c.id}`}
                          className="text-xs text-green-dark font-semibold hover:underline whitespace-nowrap"
                        >
                          {t.view}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {pageItems.map((c) => {
              const latest = c.coffeeHistory[0] ?? null;
              return (
                <div
                  key={c.id}
                  className="bg-[#FDFBF7] border border-brown-light rounded-card px-4 py-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-2">
                      <Link
                        href={`/${locale}/app/coffees/${c.id}`}
                        className="font-semibold text-brown-dark hover:text-green-dark leading-tight"
                      >
                        {c.name}
                      </Link>
                      {(c.isMine || isAdmin) && (
                        <VisibilityPill
                          isPublic={c.isPublic}
                          labelPublic={t.listPublic}
                          labelPrivate={t.listPrivate}
                        />
                      )}
                    </span>
                    <ProcessBadge type={c.processType} />
                  </div>
                  {c.ownerName && (
                    <div className="text-xs text-brown-mid">
                      {t.adminOwnerPrefix} {c.ownerName}
                    </div>
                  )}
                  {(c.country || c.region) && (
                    <div className="text-xs text-brown-mid">
                      {[c.country, c.region].filter(Boolean).join(", ")}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <ScoreBadge score={latest?.individualScore ?? null} />
                    <Link
                      href={`/${locale}/app/coffees/${c.id}`}
                      className="text-xs text-green-dark font-semibold hover:underline"
                    >
                      {t.view}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-brown-mid pt-1">
            <span>{showingText}</span>
            <div className="flex gap-2">
              <button
                disabled={safePage <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded-pill border border-brown-light text-brown-dark disabled:opacity-40 hover:border-green-dark disabled:cursor-not-allowed"
              >
                ‹ Ant.
              </button>
              <button
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded-pill border border-brown-light text-brown-dark disabled:opacity-40 hover:border-green-dark disabled:cursor-not-allowed"
              >
                Sig. ›
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
