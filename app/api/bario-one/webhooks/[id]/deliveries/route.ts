import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import type { BoWebhook, BoWebhookDelivery } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const webhookRows = (await sql`SELECT * FROM bo_webhooks WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoWebhook[]
    if (webhookRows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const rows = (await sql`
      SELECT * FROM bo_webhook_deliveries WHERE webhook_id = ${params.id} ORDER BY created_at DESC LIMIT 20
    `) as unknown as BoWebhookDelivery[]

    return NextResponse.json({
      deliveries: rows.map((d) => ({ id: d.id, eventType: d.event_type, responseStatus: d.response_status, success: d.success, error: d.error, createdAt: d.created_at })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
