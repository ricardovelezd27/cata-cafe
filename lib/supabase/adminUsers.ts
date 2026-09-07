import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lists every Supabase auth user via the service-role admin API, paging
 * through the full result set.
 *
 * CRITICAL: pagination MUST terminate on the response's `nextPage` field
 * (null/undefined once exhausted — see the `Pagination` type in
 * @supabase/auth-js's lib/types.d.ts, and GoTrueAdminApi.listUsers(), which
 * always returns { nextPage, lastPage, total } alongside `users`). The old
 * heuristic of stopping once `data.users.length < perPage` is WRONG: GoTrue
 * clamps `per_page` server-side, so a requested perPage of 1000 can come
 * back smaller than 1000 even when more pages remain, which silently
 * truncated the result to page 1 and showed "correo no disponible" for real
 * users. Always drive the loop off `nextPage`, never off the page size.
 *
 * Degrades to partial results on any error (never throws) — callers that
 * map ids to emails should treat a missing id as "unknown", not as a hard
 * failure.
 */
export async function listAllAuthUsers(): Promise<
  { id: string; email: string | null; isAnonymous: boolean }[]
> {
  const users: { id: string; email: string | null; isAnonymous: boolean }[] = [];
  try {
    const admin = createAdminClient();
    const perPage = 1000;
    let page = 1;
    const MAX_PAGES = 50; // safety cap — well beyond any realistic user count
    for (let i = 0; i < MAX_PAGES; i++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) break;
      for (const u of data.users) {
        users.push({ id: u.id, email: u.email ?? null, isAnonymous: u.is_anonymous === true });
      }
      if (!data.nextPage) break;
      page = data.nextPage;
    }
  } catch {
    // Degrade to whatever was gathered so far.
  }
  return users;
}
