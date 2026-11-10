import { describe, expect, it } from "vitest";
import { detectInAppBrowser } from "@/lib/platform/inAppBrowser";

const UA = {
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E236 Instagram 330.0.0.34.116 (iPhone14,5; iOS 17_4; es_ES)",
  facebook:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0.30.109;]",
  whatsapp: "WhatsApp/2.24.5.76 A",
  line: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari Line/13.9.0",
  tiktok:
    "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/118 Mobile Safari/537.36 BytedanceWebview/d8a21c6",
  safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  chrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

describe("detectInAppBrowser", () => {
  it("flags the five webviews", () => {
    expect(detectInAppBrowser(UA.instagram)).toBe("instagram");
    expect(detectInAppBrowser(UA.facebook)).toBe("facebook");
    expect(detectInAppBrowser(UA.whatsapp)).toBe("whatsapp");
    expect(detectInAppBrowser(UA.line)).toBe("line");
    expect(detectInAppBrowser(UA.tiktok)).toBe("tiktok");
  });
  it("leaves real browsers and empty input alone", () => {
    expect(detectInAppBrowser(UA.safari)).toBeNull();
    expect(detectInAppBrowser(UA.chrome)).toBeNull();
    expect(detectInAppBrowser("")).toBeNull();
    expect(detectInAppBrowser(null)).toBeNull();
    expect(detectInAppBrowser(undefined)).toBeNull();
  });
});
