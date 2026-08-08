import { NextResponse } from 'next/server'
import { randomUUID, randomBytes } from 'node:crypto'
import { requireBoMembership } from '@/lib/barioOne'
import { BO_WEBHOOK_EVENTS } from '@/lib/barioOneWebhooks'
import type { BoWebhook } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`SELECT * FROM bo_webhooks WHERE organization_id = ${org.id} ORDER BY created_at DESC`) as unknown as BoWebhook[]
    return NextResponse.json({
      webhooks: rows.map((w) => ({ id: w.id, url: w.url, eventTypes: JSON.parse(w.event_types_json), status: w.status, createdAt: w.created_at })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, user, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can add webhooks' }, { status: 403 })
    }

    const { url, eventTypes } = await req.json()
    if (typeof url !== 'string' || !/^https:\/\//.test(url)) {
      return NextResponse.json({ error: 'A valid https:// URL is required' }, { status: 400 })
    }
    const events = Array.isArray(eventTypes) ? eventTypes.filter((e) => BO_WEBHOOK_EVENTS.includes(e)) : []
    if (events.length === 0) return NextResponse.json({ error: 'Select at least one event type' }, { status: 400 })

    const id = randomUUID()
    const secret = randomBytes(24).toString('hex')
    await sql`
      INSERT INTO bo_webhooks (id, organization_id, url, event_types_json, secret, created_by_user_id)
      VALUES (${id}, ${org.id}, ${url}, ${JSON.stringify(events)}, ${secret}, ${user.id})
    `
    return NextResponse.json({ ok: true, id, secret })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can remove webhooks' }, { status: 403 })
    }

    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    await sql`DELETE FROM bo_webhooks WHERE id = ${id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
