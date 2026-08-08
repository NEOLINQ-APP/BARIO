import { NextResponse } from 'next/server'
import { db, type BoApiKey, type BoOrganization } from '@/lib/db'
import { verifyBoApiKey } from '@/lib/barioOneApiKeys'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'

type Sql = Awaited<ReturnType<typeof db>>

// Shared auth guard for every app/api/bario-one/v1/* route — mirrors
// lib/flo/auth.ts's requireFloApiKey exactly (same Authorization: Bearer
// shape, same per-key rate limit), just resolving to a bo_organization
// instead of a crm_stack. The rate limit is per KEY, not per org, so
// issuing more keys doesn't multiply what a single integration can do —
// each one still has to respect its own ceiling.
export async function requireBoApiKey(req: Request): Promise<{ sql: Sql; apiKey: BoApiKey; org: BoOrganization } | NextResponse> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Authorization: Bearer <bo_flo_live_...> header' }, { status: 401 })
  }
  const rawKey = authHeader.slice('Bearer '.length).trim()

  const sql = await db()
  const apiKey = await verifyBoApiKey(sql, rawKey)
  if (!apiKey) return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 })

  const allowed = await rateLimit(sql, `bo_flo_api:${apiKey.id}`, 60, 60)
  if (!allowed) return rateLimitResponse()

  const rows = (await sql`SELECT * FROM bo_organizations WHERE id = ${apiKey.organization_id}`) as unknown as BoOrganization[]
  const org = rows[0]
  if (!org) return NextResponse.json({ error: "This key's organization no longer exists" }, { status: 410 })

  return { sql, apiKey, org }
}
