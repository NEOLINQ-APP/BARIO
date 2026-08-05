import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import type { VoiceAgentOrder, VoiceAgentConfig } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const orders = (await sql`
      SELECT o.*, u.email AS user_email FROM voice_agent_orders o
      JOIN users u ON u.id = o.user_id
      WHERE o.status IN ('pending_build', 'active')
      ORDER BY o.created_at DESC
    `) as unknown as (VoiceAgentOrder & { user_email: string })[]

    const configs = (await sql`SELECT * FROM voice_agent_configs`) as unknown as VoiceAgentConfig[]
    const configByOrderId = Object.fromEntries(configs.map((c) => [c.order_id, c]))

    return NextResponse.json({
      orders: orders.map((o) => ({ ...o, config: configByOrderId[o.id] ?? null })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
