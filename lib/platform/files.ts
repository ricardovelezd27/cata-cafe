// Download / share seam (S8-15). Web: anchor download, Web Share when it can
// carry files. Never throws; returns { ok, via }.
import { isNativeShell } from "./env";

export type FileInput = {
  filename: string;
  mime?: string;
  /** Any URL, data URLs included. */
  url?: string;
  blob?: Blob;
  text?: string;
};
export type PlatformResult = { ok: boolean; via: "anchor" | "share" | "native" | "none" };

export function downloadFile(input: FileInput): PlatformResult {
  try {
    if (typeof document === "undefined") return { ok: false, via: "none" };
    if (isNativeShell()) {
      // TODO(native): Filesystem.writeFile({ path, data, directory: Cache }) then
      // Share.share({ url }) — a WebView will not save an anchor download.
      return { ok: false, via: "native" };
    }
    let href = input.url;
    let revoke = false;
    if (href === undefined) {
      const blob = input.blob ?? new Blob([input.text ?? ""], { type: input.mime ?? "text/plain;charset=utf-8" });
      href = URL.createObjectURL(blob);
      revoke = true;
    }
    const a = document.createElement("a");
    a.href = href;
    a.download = input.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (revoke) {
      const h = href;
      setTimeout(() => URL.revokeObjectURL(h), 1000);
    }
    return { ok: true, via: "anchor" };
  } catch {
    return { ok: false, via: "none" };
  }
}

export async function shareFile(input: FileInput): Promise<PlatformResult> {
  try {
    if (isNativeShell()) {
      // TODO(native): Share.share({ files: [path] }) after Filesystem.writeFile.
      return { ok: false, via: "native" };
    }
    let blob = input.blob;
    if (!blob && input.text !== undefined) blob = new Blob([input.text], { type: input.mime });
    if (!blob && input.url) blob = await (await fetch(input.url)).blob();
    if (blob && typeof navigator !== "undefined" && navigator.canShare && navigator.share) {
      const file = new File([blob], input.filename, { type: input.mime ?? blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return { ok: true, via: "share" };
      }
    }
    return downloadFile(blob ? { blob, filename: input.filename, mime: input.mime } : input);
  } catch {
    return { ok: false, via: "none" };
  }
}
