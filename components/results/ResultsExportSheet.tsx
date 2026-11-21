"use client";

// S1 (F-01): every export of the results page lives in ONE sheet opened by one
// "Exportar" button (a bottom sheet on phones, a centred dialog from 640 px:
// ResponsiveDialog). Two files: the CVA sheet PDF and the CSV without names.
// Which ones a viewer gets is decided by lib/resultsExports.ts; each is a
// ReportLink (offline-aware, lib/platform underneath).
//
// Focus goes back to "Exportar" when the sheet closes: the kit's dialog
// (ResponsiveDialog) returns focus to the element that opened it (N3).

import { useState } from "react";
import { Download, FileDown } from "lucide-react";
import { Button } from "@/components/ui";
import { ReportLink } from "@/components/ui/ReportLink";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import type { ResultsExportId } from "@/lib/resultsExports";

export type ResultsExportSheetTranslations = {
  open: string;
  title: string;
  close: string;
  downloadPdf: string;
  downloadCsvNoNames: string;
  needsConnection: string;
};

export function ResultsExportSheet({
  sessionId,
  locale,
  actions,
  t,
}: {
  sessionId: string;
  locale: string;
  actions: ResultsExportId[];
  t: ResultsExportSheetTranslations;
}) {
  const [open, setOpen] = useState(false);

  if (actions.length === 0) return null;

  const item = (id: ResultsExportId) => {
    switch (id) {
      case "cvaPdf":
        // Server-generated CVA PDF: a plain link, so no @react-pdf ships to the client.
        return (
          <ReportLink
            href={`/api/sessions/${sessionId}/cva-pdf?locale=${locale}`}
            filename={`cva-${sessionId}.pdf`}
            offlineLabel={t.needsConnection}
            size="md"
            variant="primary"
            icon={<FileDown size={16} aria-hidden />}
            className="w-full"
          >
            {t.downloadPdf}
          </ReportLink>
        );
      case "csvNoNames":
        // S10 WP5a (D5): same data, codes instead of names, safe to share.
        return (
          <ReportLink
            href={`/api/sessions/${sessionId}/results-csv?locale=${locale}&names=0`}
            filename={locale === "en" ? "results-no-names.csv" : "resultados-sin-nombres.csv"}
            offlineLabel={t.needsConnection}
            size="md"
            variant="secondary"
            icon={<FileDown size={16} aria-hidden />}
            className="w-full"
          >
            {t.downloadCsvNoNames}
          </ReportLink>
        );
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        icon={<Download size={14} aria-hidden />}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {t.open}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={t.title} closeLabel={t.close}>
        <ul className="flex flex-col gap-2 pb-2">
          {actions.map((id) => (
            <li key={id}>{item(id)}</li>
          ))}
        </ul>
      </ResponsiveDialog>
    </>
  );
}
