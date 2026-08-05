import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasPaidPlan } from '@/lib/access'
import { errorResponse } from '@/lib/errors'

const PHONE_RE = /^\+?[0-9]{7,15}$/

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const businessName = typeof body?.businessName === 'string' ? body.businessName.trim() : ''
    const businessDescription = typeof body?.businessDescription === 'string' ? body.businessDescription.trim() : ''
    const forwardToNumber = typeof body?.forwardToNumber === 'string' ? body.forwardToNumber.trim() : ''
    const greeting = typeof body?.greeting === 'string' && body.greeting.trim() ? body.greeting.trim() : null
    const floApiKeyId = typeof body?.floApiKeyId === 'string' && body.floApiKeyId.trim() ? body.floApiKeyId.trim() : null

    if (!businessName) return NextResponse.json({ error: 'Business name is required' }, { status: 400 })
    if (!businessDescription) return NextResponse.json({ error: 'Describe what your business does — this is what the AI tells callers' }, { status: 400 })
    if (!PHONE_RE.test(forwardToNumber)) return NextResponse.json({ error: 'Enter a valid phone number to forward calls to' }, { status: 400 })

    // Linking a Flo API key is optional, but if one is given it must
    // actually belong to this account — otherwise leads could get written
    // into a CRM workspace this user doesn't own.
    if (floApiKeyId) {
      const keyRows = (await sql`SELECT id FROM flo_api_keys WHERE id = ${floApiKeyId} AND user_id = ${user.id} AND revoked_at IS NULL`) as unknown as { id: string }[]
      if (!keyRows[0]) return NextResponse.json({ error: 'That Flo API key was not found on your account' }, { status: 400 })
    }

    if (!hasPaidPlan(user)) {
      return NextResponse.json({ error: 'Upgrade to a paid plan to order the Voice Agent' }, { status: 403 })
    }

    const id = randomUUID()
    await sql`
      INSERT INTO voice_agent_orders (id, user_id, business_name, business_description, forward_to_number, greeting, flo_api_key_id, status)
      VALUES (${id}, ${user.id}, ${businessName}, ${businessDescription}, ${forwardToNumber}, ${greeting}, ${floApiKeyId}, 'pending_payment')
    `

    return NextResponse.json({ ok: true, orderId: id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
