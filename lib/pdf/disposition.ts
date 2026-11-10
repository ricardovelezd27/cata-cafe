// Content-Disposition for report routes: `?inline=1` opens the native viewer
// (iOS Safari, WebViews that can render PDFs), otherwise a download.
export function pdfDisposition(inline: boolean, filename: string): string {
  return `${inline ? "inline" : "attachment"}; filename="${filename}"`;
}
