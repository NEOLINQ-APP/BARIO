import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import type { VoiceAgentOrder } from '@/lib/db'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

const PHONE_RE = /^\+[0-9]{7,15}$/

// The one manual step in the whole pipeline (see the plan this was built
// from): the admin has already bought/assigned a real Twilio number
// outside this app (Twilio number search/purchase automation doesn't
// exist yet) and pastes it in here. Everything else — business info,
// forwarding number, CRM link — was already collected from the customer
// at order time; this just activates it.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM voice_agent_orders WHERE id = ${params.id} AND status = 'pending_build'`) as unknown as VoiceAgentOrder[]
    const order = rows[0]
    if (!order) return NextResponse.json({ error: 'Order not found or not awaiting build' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const twilioNumber = typeof body?.twilioNumber === 'string' ? body.twilioNumber.trim() : ''
    if (!PHONE_RE.test(twilioNumber)) return NextResponse.json({ error: 'twilioNumber must be E.164, e.g. +17801234567' }, { status: 400 })

    const existing = (await sql`SELECT id FROM voice_agent_configs WHERE twilio_number = ${twilioNumber}`) as unknown as { id: string }[]
    if (existing[0]) return NextResponse.json({ error: 'That Twilio number is already assigned to another config' }, { status: 409 })

    const greeting = (typeof body?.greeting === 'string' && body.greeting.trim()) || order.greeting || `Hi, thank you for calling ${order.business_name}! How may I help you today?`

    const configId = randomUUID()
    await sql`
      INSERT INTO voice_agent_configs (id, order_id, twilio_number, business_name, business_description, forward_to_number, greeting, flo_api_key_id)
      VALUES (${configId}, ${order.id}, ${twilioNumber}, ${order.business_name}, ${order.business_description}, ${order.forward_to_number}, ${greeting}, ${order.flo_api_key_id})
    `
    await sql`UPDATE voice_agent_orders SET status = 'active', updated_at = now() WHERE id = ${order.id}`

    await logAdminAction(sql, { action: 'voice-agent-build', params: { orderId: order.id, configId, twilioNumber }, result: 'ok' })
    return NextResponse.json({ ok: true, configId })
  } catch (err: any) {
    return errorResponse(err)
  }
}
