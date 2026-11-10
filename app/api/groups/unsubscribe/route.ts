import { prisma } from "@/lib/prisma";
import { addressesForToken, parseUnsubscribeToken } from "@/lib/groupUnsubscribe";
import {
  confirmPage,
  donePage,
  invalidPage,
  localeFromAcceptLanguage,
} from "@/lib/groupUnsubscribePage";

// Public per-group email unsubscribe (S8-20, F-grupos-8). No auth, no cookies:
// the signed token (lib/groupUnsubscribe.ts) is the credential and it can only
// switch mail OFF. GET shows a confirm page; POST opts out (also the RFC 8058
// one-click POST a mail client sends with `List-Unsubscribe=One-Click`). A bad
// token, a wrong group and an address that is not a member all answer with the
// same neutral 400, so the route never reveals who is in a group.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
} as const;

function html(body: string, status: number): Response {
  return new Response(body, { status, headers: HEADERS });
}

/** The member rows (of the token's group) the token belongs to. */
async function resolve(token: string | null) {
  const parsed = token ? parseUnsubscribeToken(token) : null;
  if (!token || !parsed) return null;
  const members = await prisma.tastingGroupMember.findMany({
    where: { groupId: parsed.groupId },
    select: { id: true, email: true, group: { select: { name: true } } },
  });
  const emails = new Set(addressesForToken(token, parsed.groupId, members.map((m) => m.email)));
  const mine = members.filter((m) => emails.has(m.email));
  if (mine.length === 0) return null;
  return { ids: mine.map((m) => m.id), groupName: mine[0].group.name };
}

export async function GET(req: Request) {
  const locale = localeFromAcceptLanguage(req.headers.get("accept-language"));
  const token = new URL(req.url).searchParams.get("token");
  try {
    const found = await resolve(token);
    if (!found || !token) return html(invalidPage(locale), 400);
    return html(confirmPage(locale, found.groupName, token), 200);
  } catch {
    return html(invalidPage(locale), 400);
  }
}

export async function POST(req: Request) {
  const locale = localeFromAcceptLanguage(req.headers.get("accept-language"));
  const token = new URL(req.url).searchParams.get("token");
  try {
    const found = await resolve(token);
    if (!found) return html(invalidPage(locale), 400);
    // Idempotent: a second POST keeps the first timestamp.
    await prisma.tastingGroupMember.updateMany({
      where: { id: { in: found.ids }, emailOptOutAt: null },
      data: { emailOptOutAt: new Date() },
    });
    return html(donePage(locale), 200);
  } catch {
    return html(invalidPage(locale), 400);
  }
}
