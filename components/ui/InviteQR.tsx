"use client";

import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toBlob, toPng } from "html-to-image";
import { Copy, Download, Check } from "lucide-react";
import { downloadFile } from "@/lib/platform/files";
import { Button } from "./Button";

interface InviteQRProps {
  /** The full URL encoded into the QR code (e.g. from buildInviteUrl). */
  url: string;
  /** QR module size in px. Defaults to a comfortably scannable size. */
  size?: number;
  labels: {
    copyImage: string;
    download: string;
    copied: string;
  };
}

/**
 * Renders a scannable QR code for a group-session invite link, with buttons
 * to copy it as an image (clipboard) or download it as a PNG. Used in the
 * new-session invite step, the cupping master controls, and (server-rendered
 * variant) the print sheet.
 */
export function InviteQR({ url, size = 176, labels }: InviteQRProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const flashCopied = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    if (!wrapRef.current) return;
    try {
      const dataUrl = await toPng(wrapRef.current, {
        pixelRatio: 3,
        backgroundColor: "#FFFFFF",
      });
      downloadFile({ url: dataUrl, filename: "invitacion-cata.png", mime: "image/png" });
    } catch {
      // Best-effort — nothing else to do if PNG generation fails outright.
    }
  };

  const handleCopyImage = async () => {
    if (!wrapRef.current) return;
    try {
      const blob = await toBlob(wrapRef.current, {
        pixelRatio: 3,
        backgroundColor: "#FFFFFF",
      });
      if (!blob || typeof ClipboardItem === "undefined") {
        // Clipboard image writes aren't supported in this browser — a direct
        // download still gets the user a usable, scannable image.
        await handleDownload();
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flashCopied();
    } catch {
      await handleDownload();
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* White quiet-zone wrapper — also the exact node captured for copy/download */}
      <div
        ref={wrapRef}
        className="inline-flex bg-surface-container-lowest p-4 rounded-card border border-outline-variant"
      >
        <QRCodeSVG
          value={url}
          size={size}
          level="M"
          marginSize={0}
          bgColor="#FFFFFF"
          fgColor="#1f1b19"
        />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCopyImage}
          icon={copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
        >
          {copied ? labels.copied : labels.copyImage}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDownload} icon={<Download size={13} aria-hidden />}>
          {labels.download}
        </Button>
      </div>
    </div>
  );
}
