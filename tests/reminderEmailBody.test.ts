import { describe, expect, it } from "vitest";
import { buildReminderHtml, loginNextUrl, reminderPath, reminderSubject } from "@/lib/reminderEmailBody";

describe("reminder email body", () => {
  it("links through login with next= the cup screen", () => {
    const url = loginNextUrl("https://x.test", "es", reminderPath("es", "abc"));
    expect(url).toBe("https://x.test/es/auth/login?next=" + encodeURIComponent("/es/app/sessions/abc/cup"));
  });

  it("deadline_24h states the consequence, in both languages", () => {
    const es = buildReminderHtml({ kind: "deadline_24h", locale: "es", sessionName: "S", url: "https://x.test/u" });
    expect(es).toContain("menos de 24 horas");
    expect(es).toContain("no cuentan en los resultados");
    const en = buildReminderHtml({ kind: "deadline_24h", locale: "en", sessionName: "S", url: "https://x.test/u" });
    expect(en).toContain("less than 24 hours");
    expect(en).toContain("not counted in the results");
  });

  it("live_idle says nothing was closed on the owner's behalf", () => {
    const es = buildReminderHtml({ kind: "live_idle", locale: "es", sessionName: "S", url: "https://x.test/u" });
    expect(es).toContain("No la cerramos por ti");
    expect(reminderSubject("live_idle", "en", "S")).toBe("Your cupping is still open: S");
  });

  it("escapes the session name and the link", () => {
    const html = buildReminderHtml({
      kind: "deadline_24h",
      locale: "en",
      sessionName: "<script>x</script>",
      url: 'https://x.test/?a="b"',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('a="b"');
  });
});
