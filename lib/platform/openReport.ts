import { downloadFile, shareFile, type PlatformResult } from "./files";

export type OpenReportResult = PlatformResult | { ok: false; via: "offline" };

/**
 * Fetch an authenticated report (PDF) and hand it to the platform: share where
 * the OS offers it, else download. Returns `offline` WITHOUT fetching when the
 * caller says the device is offline. Never throws.
 */
export async function openReport(
  url: string,
  filename: string,
  opts: { online?: boolean; mime?: string } = {},
): Promise<OpenReportResult> {
  if (opts.online === false) return { ok: false, via: "offline" };
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return { ok: false, via: "none" };
    const blob = await res.blob();
    const input = { blob, filename, mime: opts.mime ?? "application/pdf" };
    const shared = await shareFile(input);
    return shared.ok ? shared : downloadFile(input);
  } catch {
    return { ok: false, via: "none" };
  }
}
