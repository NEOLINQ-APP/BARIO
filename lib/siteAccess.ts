// Resolves which site a request is operating on. If a siteId is given, it
// must belong to the requesting user (returns null otherwise — treated as
// 404 by callers). If omitted, falls back to the user's first site, so
// every pre-multi-site link/flow keeps working unchanged for accounts that
// only ever had one site.
export async function resolveSiteId(sql: any, userId: string, requestedSiteId?: string | null): Promise<string | null> {
  if (requestedSiteId) {
    const rows = (await sql`SELECT id FROM sites WHERE id = ${requestedSiteId} AND user_id = ${userId}`) as unknown as { id: string }[]
    return rows[0]?.id ?? null
  }
  const rows = (await sql`SELECT id FROM sites WHERE user_id = ${userId} ORDER BY updated_at ASC LIMIT 1`) as unknown as { id: string }[]
  return rows[0]?.id ?? null
}
