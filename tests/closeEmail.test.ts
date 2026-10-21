import { describe, it, expect } from "vitest";
import { buildCloseEmailHtml, closeEmailSubject } from "@/lib/closeEmailBody";
import { buildResultsLoginUrl } from "@/lib/inviteUrl";

describe("close email body", () => {
  const url = buildResultsLoginUrl("https://x.test", "es", "abc-123");
  it("links to login with next=results", () => {
    expect(url).toBe(
      "https://x.test/es/auth/login?next=" + encodeURIComponent("/es/app/sessions/abc-123/results"),
    );
    const html = buildCloseEmailHtml({ locale: "es", sessionName: "S", dateStr: "", resultsUrl: url });
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain("Ver mis resultados");
  });
  it("escapes the session name", () => {
    const html = buildCloseEmailHtml({ locale: "en", sessionName: "<script>x</script>", dateStr: "1 Jan", resultsUrl: url });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("View my results");
    expect(closeEmailSubject("en", "A")).toBe("Results — A");
  });
});
