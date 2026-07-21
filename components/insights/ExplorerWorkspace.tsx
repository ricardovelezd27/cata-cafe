"use client";

import { useCallback, useRef, useState } from "react";
import { Save, Trash2, FolderOpen } from "lucide-react";
import { isPivotConfigLike } from "@/lib/analytics/types";
import type { InsightConfig, PivotConfig } from "@/lib/analytics/types";
import { deleteSavedInsight, listSavedInsights, saveInsight } from "@/app/actions/analytics";
import { ExplorerBuilder, type ExplorerTranslations } from "@/components/insights/ExplorerBuilder";
import { PivotBuilder, type PivotTranslations } from "@/components/insights/PivotBuilder";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";

export interface SavedInsightItem {
  id: string;
  name: string;
  config: unknown;
  createdAt: string;
  isMine: boolean;
}

export interface ExplorerWorkspaceTranslations {
  mode: { simple: string; pivot: string };
  save: string;
  saveName: string;
  saveConfirm: string;
  savedTitle: string;
  savedEmpty: string;
  load: string;
  delete: string;
  close: string;
  running: string;
}

interface ExplorerWorkspaceProps {
  locale: string;
  initialSaved: SavedInsightItem[];
  t: ExplorerWorkspaceTranslations;
  simpleT: ExplorerTranslations;
  pivotT: PivotTranslations;
}

const inputClass =
  "w-full rounded-input border border-[#E8E0D0] bg-white px-3 py-2 text-sm text-brown-dark focus:outline-none focus:border-[#3D5A3E]";

type Mode = "simple" | "pivot";

/**
 * Parent of the two Explorer builders: owns the simple/pivot mode toggle and
 * the saved-insights list + save dialog (moved out of ExplorerBuilder).
 * Saving reads whichever builder is mounted via a ref updated on every
 * config change (cheap — no re-render); loading a saved item switches mode
 * (isPivotConfigLike) and pushes the raw config + a bumped loadKey into the
 * matching builder, which does its own parsing/validation.
 */
export function ExplorerWorkspace({ locale, initialSaved, t, simpleT, pivotT }: ExplorerWorkspaceProps) {
  const [mode, setMode] = useState<Mode>("simple");

  const configRef = useRef<InsightConfig | PivotConfig | null>(null);
  const handleSimpleConfigChange = useCallback((config: InsightConfig) => {
    configRef.current = config;
  }, []);
  const handlePivotConfigChange = useCallback((config: PivotConfig) => {
    configRef.current = config;
  }, []);

  const [simpleLoadedConfig, setSimpleLoadedConfig] = useState<unknown>(null);
  const [simpleLoadKey, setSimpleLoadKey] = useState(0);
  const [pivotLoadedConfig, setPivotLoadedConfig] = useState<unknown>(null);
  const [pivotLoadKey, setPivotLoadKey] = useState(0);

  const [saved, setSaved] = useState<SavedInsightItem[]>(initialSaved);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!configRef.current) return;
    setSaving(true);
    try {
      const result = await saveInsight(saveName, configRef.current);
      if (result.ok) {
        setSaveOpen(false);
        setSaveName("");
        setSaved(await listSavedInsights());
      }
    } finally {
      setSaving(false);
    }
  }

  function loadSaved(item: SavedInsightItem) {
    if (isPivotConfigLike(item.config)) {
      setMode("pivot");
      setPivotLoadedConfig(item.config);
      setPivotLoadKey((k) => k + 1);
    } else {
      setMode("simple");
      setSimpleLoadedConfig(item.config);
      setSimpleLoadKey((k) => k + 1);
    }
  }

  async function handleDelete(id: string) {
    const result = await deleteSavedInsight(id);
    if (result.ok) setSaved((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="flex flex-col gap-5 pb-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-pill border border-[#E8E0D0] bg-cream p-1">
          <button
            type="button"
            onClick={() => setMode("simple")}
            className={`px-4 py-1.5 rounded-pill text-sm font-semibold transition-colors ${
              mode === "simple" ? "bg-[#3D5A3E] text-white" : "text-brown-mid hover:text-brown-dark"
            }`}
          >
            {t.mode.simple}
          </button>
          <button
            type="button"
            onClick={() => setMode("pivot")}
            className={`px-4 py-1.5 rounded-pill text-sm font-semibold transition-colors ${
              mode === "pivot" ? "bg-[#3D5A3E] text-white" : "text-brown-mid hover:text-brown-dark"
            }`}
          >
            {t.mode.pivot}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setSaveOpen(true)}
          className="flex items-center gap-1.5 text-sm text-[#3D5A3E] font-semibold hover:underline"
        >
          <Save size={15} />
          {t.save}
        </button>
      </div>

      {/* Inactive builder stays unmounted so it doesn't run its own debounced
          query in the background — it re-initializes from scratch (or from a
          loaded config) whenever its mode becomes active again. */}
      {mode === "simple" ? (
        <ExplorerBuilder
          locale={locale}
          t={simpleT}
          loadedConfig={simpleLoadedConfig}
          loadKey={simpleLoadKey}
          onConfigChange={handleSimpleConfigChange}
        />
      ) : (
        <PivotBuilder
          locale={locale}
          t={pivotT}
          loadedConfig={pivotLoadedConfig}
          loadKey={pivotLoadKey}
          onConfigChange={handlePivotConfigChange}
        />
      )}

      {/* Saved insights */}
      <div className="bg-white rounded-card border border-[#E8E0D0] shadow-card p-5">
        <h2 className="text-xs font-semibold text-brown-mid uppercase tracking-wide mb-3">
          {t.savedTitle}
        </h2>
        {saved.length === 0 ? (
          <p className="text-sm text-brown-mid">{t.savedEmpty}</p>
        ) : (
          <ul className="divide-y divide-[#F5F0E6]">
            {saved.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <span className="flex-1 text-sm text-brown-dark truncate">{item.name}</span>
                <span className="text-xs text-brown-mid hidden sm:block">
                  {new Date(item.createdAt).toLocaleDateString(locale)}
                </span>
                <button
                  type="button"
                  onClick={() => loadSaved(item)}
                  className="flex items-center gap-1 text-xs text-[#3D5A3E] font-semibold hover:underline"
                >
                  <FolderOpen size={14} />
                  {t.load}
                </button>
                {item.isMine && (
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="flex items-center gap-1 text-xs text-brown-mid hover:text-red-defect"
                    aria-label={t.delete}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ResponsiveDialog open={saveOpen} onOpenChange={setSaveOpen} title={t.save} closeLabel={t.close}>
        <div className="flex flex-col gap-3 p-1">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
              {t.saveName}
            </span>
            <input
              type="text"
              className={inputClass}
              value={saveName}
              maxLength={80}
              onChange={(e) => setSaveName(e.target.value)}
              autoFocus
            />
          </label>
          <button
            type="button"
            disabled={saving || saveName.trim().length === 0}
            onClick={handleSave}
            className="self-end rounded-pill bg-[#3D5A3E] text-white text-sm font-semibold px-4 py-2 disabled:opacity-50"
          >
            {saving ? t.running : t.saveConfirm}
          </button>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
