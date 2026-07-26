// Resolves which site a request is operating on. If a siteId is given, it
// must belong to the requesting user (returns null otherwise — treated as
// 404 by callers). If omitted, falls back to whichever of the user's sites
// was worked on most recently, so pre-multi-site links/flows (e.g. a bare
// /build with no ?site=) land on the site they were actually just editing
// rather than an arbitrary older one.
export async function resolveSiteId(sql: any, userId: string, requestedSiteId?: string | null): Promise<string | null> {
  if (requestedSiteId) {
    const rows = (await sql`SELECT id FROM sites WHERE id = ${requestedSiteId} AND user_id = ${userId}`) as unknown as { id: string }[]
    return rows[0]?.id ?? null
  }
  const rows = (await sql`SELECT id FROM sites WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 1`) as unknown as { id: string }[]
  return rows[0]?.id ?? null
}
