import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type CrmStack, type User } from '@/lib/db'
import { hasPaidPlan } from '@/lib/access'
import { createFloApiKey, listFloApiKeys, revokeFloApiKey } from '@/lib/flo/apiKeys'
import { errorResponse } from '@/lib/errors'

async function getActiveCrmStack(sql: any, userId: string): Promise<CrmStack | null> {
  const rows = (await sql`SELECT * FROM crm_stacks WHERE user_id = ${userId} AND status = 'active'`) as unknown as CrmStack[]
  return rows[0] ?? null
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const keys = (await listFloApiKeys(sql, session.userId)).map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.key_prefix,
    createdAt: k.created_at,
    lastUsedAt: k.last_used_at,
    revoked: !!k.revoked_at,
  }))
  return NextResponse.json({ keys })
}

// Requires an active (fully provisioned) CRM workspace — a Flo API key
// without one has nothing to authorize access to, since crm_stack_id is
// what every app/api/flo/v1/* call uses to find which Twenty instance (and,
// once linked, which stored Twenty API key) to act against.
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user || !hasPaidPlan(user)) {
    return NextResponse.json({ error: 'Upgrade to a paid plan to use the Flo API' }, { status: 403 })
  }

  try {
    const crmStack = await getActiveCrmStack(sql, session.userId)
    if (!crmStack) return NextResponse.json({ error: 'Set up your Flo CRM workspace first' }, { status: 400 })

    const { name } = await req.json().catch(() => ({}))
    const cleanName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : 'API key'

    const { id, rawKey } = await createFloApiKey(sql, session.userId, crmStack.id, cleanName)
    return NextResponse.json({ ok: true, id, rawKey })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const keyId = new URL(req.url).searchParams.get('id')
  if (!keyId) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const sql = await db()
  await revokeFloApiKey(sql, session.userId, keyId)
  return NextResponse.json({ ok: true })
}
