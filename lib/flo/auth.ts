import { NextResponse } from 'next/server'
import { db, type CrmStack, type FloApiKey } from '@/lib/db'
import { verifyFloApiKey } from '@/lib/flo/apiKeys'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'

type Sql = Awaited<ReturnType<typeof db>>

// Shared auth guard for every app/api/flo/v1/* route — same
// "Authorization: Bearer <key>" shape as lib/session.ts's getApiSession,
// but for a third-party caller rather than Bario's own sync client.
// 60 req/min is a placeholder single tier; the natural place to plug in
// paid-tier-based limits (e.g. read plan from crmStack's owning user) once
// this is actually monetized rather than every key sharing one ceiling.
export async function requireFloApiKey(
  req: Request
): Promise<{ sql: Sql; apiKey: FloApiKey; crmStack: CrmStack } | NextResponse> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Authorization: Bearer <flo_live_...> header' }, { status: 401 })
  }
  const rawKey = authHeader.slice('Bearer '.length).trim()

  const sql = await db()
  const apiKey = await verifyFloApiKey(sql, rawKey)
  if (!apiKey) return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 })

  const allowed = await rateLimit(sql, `flo_api:${apiKey.id}`, 60, 60)
  if (!allowed) return rateLimitResponse()

  const rows = (await sql`SELECT * FROM crm_stacks WHERE id = ${apiKey.crm_stack_id}`) as unknown as CrmStack[]
  const crmStack = rows[0]
  if (!crmStack) return NextResponse.json({ error: 'This key\'s CRM workspace no longer exists' }, { status: 410 })

  return { sql, apiKey, crmStack }
}
