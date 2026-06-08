import { NextResponse } from "next/server";

// Connectivity probe for the offline-detection layer. Intentionally trivial:
// no Prisma, no Supabase, no auth. A DB/auth hiccup must NOT read as "offline" —
// this endpoint only answers "can the client reach our server right now?".
// Always dynamic + uncached so the 30s client ping is never served from a cache.
export const dynamic = "force-dynamic";

export function GET() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
