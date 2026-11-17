"use client";

// S1 (F-01): every export and document action of the results page lives in ONE
// sheet opened by one "Exportar" button (a bottom sheet on phones, a centred
// dialog from 640 px: ResponsiveDialog). Which actions a viewer gets is decided
// by lib/resultsExports.ts (the same rules as the docked footer this replaces);
// each action keeps its component and its behaviour: ReportLink (offline-aware,
// lib/platform underneath), ButtonLink for the plain CSV, a router push for the
// print page.
//
// Focus goes back to "Exportar" when the sheet closes. The kit's dialog is
// opened here without a Radix Dialog.Trigger, so Radix has no trigger to give
// focus back to (it would land on <body>); the sheet does it itself, once the
// dialog has left the DOM (after its exit animation and focus trap).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileDown, Printer } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui";
import { ReportLink } from "@/components/ui/ReportLink";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import type { ResultsExportId } from "@/lib/resultsExports";

export type ResultsExportSheetTranslations = {
  open: string;
  title: string;
  close: string;
  viewForm: string;
  downloadPdf: string;
  downloadSummary: string;
  downloadFicha: string;
  downloadCsv: string;
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const buttonBox = useRef<HTMLSpanElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    let frames = 0;
    let id = 0;
    const giveFocusBack = () => {
      if (document.querySelector('[role="dialog"]') && frames++ < 90) {
        id = requestAnimationFrame(giveFocusBack);
        return;
      }
      buttonBox.current?.querySelector("button")?.focus();
    };
    id = requestAnimationFrame(giveFocusBack);
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (actions.length === 0) return null;

  const item = (id: ResultsExportId) => {
    switch (id) {
      case "viewForm":
        return (
          <Button
            size="md"
            variant="secondary"
            icon={<Printer size={16} aria-hidden />}
            className="w-full"
            onClick={() => {
              setOpen(false);
              router.push(`/${locale}/app/sessions/${sessionId}/print`);
            }}
          >
            {t.viewForm}
          </Button>
        );
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
      case "summary":
        // Personal summary PDF, inline so iOS opens the native viewer.
        return (
          <ReportLink
            href={`/api/sessions/${sessionId}/participant-summary?locale=${locale}&inline=1`}
            filename={`resumen-${sessionId}.pdf`}
            offlineLabel={t.needsConnection}
            newTab
            size="md"
            variant="secondary"
            icon={<FileDown size={16} aria-hidden />}
            className="w-full"
          >
            {t.downloadSummary}
          </ReportLink>
        );
      case "ficha":
        return (
          <ReportLink
            href={`/api/sessions/${sessionId}/ficha-tecnica?locale=${locale}&inline=1`}
            filename={`ficha-${sessionId}.pdf`}
            offlineLabel={t.needsConnection}
            newTab
            size="md"
            variant="secondary"
            icon={<FileDown size={16} aria-hidden />}
            className="w-full"
          >
            {t.downloadFicha}
          </ReportLink>
        );
      case "csv":
        return (
          <ButtonLink
            href={`/api/sessions/${sessionId}/results-csv?locale=${locale}`}
            size="md"
            variant="secondary"
            icon={<FileDown size={16} aria-hidden />}
            className="w-full"
          >
            {t.downloadCsv}
          </ButtonLink>
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
      <span ref={buttonBox} className="contents">
      <Button
        size="sm"
        variant="secondary"
        icon={<Download size={14} aria-hidden />}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {t.open}
      </Button>
      </span>
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
