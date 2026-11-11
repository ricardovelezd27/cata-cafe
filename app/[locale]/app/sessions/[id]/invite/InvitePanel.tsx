"use client";

import { useState } from "react";
import { InviteQR } from "@/components/ui/InviteQR";
import { buildInviteUrl } from "@/lib/inviteUrl";

export type InvitePanelTranslations = {
  inviteLink: string;
  copyLink: string;
  copied: string;
  copyImage: string;
  downloadQr: string;
};

/** Read-only recovery of the join link + QR (S8-10 T3). The wizard's step 2
 *  lived only in memory; this route re-reads the invite from the database. */
export function InvitePanel({
  locale,
  token,
  translations: t,
}: {
  locale: string;
  token: string;
  translations: InvitePanelTranslations;
}) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined" ? buildInviteUrl(window.location.origin, locale, token) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the field below is selectable by hand.
    }
  };

  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-card p-5 space-y-3">
      <p className="text-sm font-semibold text-primary-container">{t.inviteLink}</p>
      {url && (
        <div className="flex justify-center py-1">
          <InviteQR
            url={url}
            labels={{ copyImage: t.copyImage, download: t.downloadQr, copied: t.copied }}
          />
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="w-full flex-1 select-all border border-outline-variant rounded-input px-3.5 py-2.5 text-xs text-on-surface bg-surface-container-lowest"
        />
        <button
          type="button"
          onClick={copy}
          className="border border-primary-container text-primary-container rounded-pill px-5 py-2.5 text-sm font-medium hover:bg-primary-fixed transition-colors whitespace-nowrap"
        >
          {copied ? t.copied : t.copyLink}
        </button>
      </div>
    </div>
  );
}
