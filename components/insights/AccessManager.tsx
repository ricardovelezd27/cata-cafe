"use client";

import { useMemo, useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { setAnalyticsAccess } from "@/app/actions/analytics";
import type { AnalyticsUser } from "@/app/actions/analytics";

export interface AccessTranslations {
  search: string;
  accessLabel: string;
  superAdmin: string;
  emailUnavailable: string;
  toggleError: string;
  empty: string;
}

interface AccessManagerProps {
  users: AnalyticsUser[];
  t: AccessTranslations;
}

export function AccessManager({ users: initialUsers, t }: AccessManagerProps) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [errorId, setErrorId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q),
    );
  }, [users, query]);

  async function toggle(user: AnalyticsUser) {
    const next = !user.analyticsAccess;
    setErrorId(null);
    // Optimistic update, revert on failure.
    setUsers((prev) =>
      prev.map((u) => (u.userId === user.userId ? { ...u, analyticsAccess: next } : u)),
    );
    try {
      const result = await setAnalyticsAccess(user.userId, next);
      if (!result.ok) throw new Error(result.error);
    } catch {
      setUsers((prev) =>
        prev.map((u) =>
          u.userId === user.userId ? { ...u, analyticsAccess: !next } : u,
        ),
      );
      setErrorId(user.userId);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#E8E0D0] shadow-card">
      <div className="p-4 border-b border-[#F5F0E6]">
        <label className="relative block max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-brown-mid"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            className="w-full rounded-lg border border-[#E8E0D0] bg-white pl-9 pr-3 py-2 text-sm text-brown-dark focus:outline-none focus:border-[#3D5A3E]"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="p-6 text-sm text-brown-mid text-center">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-[#F5F0E6]">
          {filtered.map((user) => (
            <li key={user.userId} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-brown-dark truncate">
                    {user.displayName}
                  </span>
                  {user.isSuperAdmin && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F0E8] text-[#3D5A3E] text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
                      <ShieldCheck size={11} />
                      {t.superAdmin}
                    </span>
                  )}
                </div>
                <span className="block text-xs text-brown-mid truncate">
                  {user.email ?? t.emailUnavailable}
                  {user.country ? ` · ${user.country}` : ""}
                </span>
                {errorId === user.userId && (
                  <span className="block text-xs text-red-defect mt-0.5">
                    {t.toggleError}
                  </span>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xs text-brown-mid hidden sm:block">
                  {t.accessLabel}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={user.isSuperAdmin || user.analyticsAccess}
                  disabled={user.isSuperAdmin}
                  onClick={() => toggle(user)}
                  className={`relative w-10 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    user.isSuperAdmin || user.analyticsAccess
                      ? "bg-[#3D5A3E]"
                      : "bg-[#E8E0D0]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      user.isSuperAdmin || user.analyticsAccess
                        ? "translate-x-[18px]"
                        : "translate-x-0.5"
                    }`}
                  />
                </button>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
