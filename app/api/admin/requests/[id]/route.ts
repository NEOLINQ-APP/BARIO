import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'
import { logAdminAction } from '@/lib/adminActions'
import { reestimateOpenQueue } from '@/lib/requestEstimator'
import { sendRequestStatusEmail } from '@/lib/email'

const VALID_STATUSES = new Set(['new', 'in_progress', 'blocked', 'done', 'cancelled'])
const COMPANY_LABELS: Record<string, string> = { afc_logistics: 'AFC Logistics', sunbuilt_group: 'Sunbuilt Group' }

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const rows = (await sql`SELECT * FROM client_requests WHERE id = ${params.id}`) as unknown as any[]
    const request = rows[0]
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const events = await sql`SELECT * FROM client_request_events WHERE request_id = ${params.id} ORDER BY created_at ASC`
    return NextResponse.json({ ok: true, request, events })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const { status, priority, note } = await req.json()

    const rows = (await sql`SELECT * FROM client_requests WHERE id = ${params.id}`) as unknown as any[]
    const request = rows[0]
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (status !== undefined && !VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const nextStatus = status ?? request.status
    const nextPriority = priority ?? request.priority

    await sql`
      UPDATE client_requests SET status = ${nextStatus}, priority = ${nextPriority}, updated_at = now() WHERE id = ${params.id}
    `

    if (status !== undefined && status !== request.status) {
      await sql`
        INSERT INTO client_request_events (id, request_id, actor, actor_label, event_type, message)
        VALUES (${randomUUID()}, ${params.id}, 'admin', 'Sherwin', 'status_change', ${note || `Status changed to ${status}`})
      `
    } else if (note) {
      await sql`
        INSERT INTO client_request_events (id, request_id, actor, actor_label, event_type, message)
        VALUES (${randomUUID()}, ${params.id}, 'admin', 'Sherwin', 'comment', ${note})
      `
    }

    await logAdminAction(sql, {
      action: 'client_request_update',
      params: { requestId: params.id, status: nextStatus, priority: nextPriority },
      result: 'ok',
    })

    // Re-estimate every other open request since the queue order/composition changed.
    if (nextStatus !== 'done' && nextStatus !== 'cancelled') {
      const { estimateRequest } = await import('@/lib/requestEstimator')
      await estimateRequest(sql, params.id)
    }
    await reestimateOpenQueue(sql, params.id)

    const updatedRows = (await sql`SELECT * FROM client_requests WHERE id = ${params.id}`) as unknown as any[]
    const updated = updatedRows[0]

    const clientRows = (await sql`
      SELECT u.email FROM client_companies cc JOIN users u ON u.id = cc.user_id WHERE cc.company_key = ${request.company_key}
    `) as unknown as { email: string }[]
    if (clientRows[0]?.email && status !== undefined) {
      await sendRequestStatusEmail(clientRows[0].email, {
        title: updated.title,
        companyLabel: COMPANY_LABELS[request.company_key] ?? request.company_key,
        status: updated.status,
        note,
        estimatedCompletionAt: updated.estimated_completion_at,
      })
    }

    return NextResponse.json({ ok: true, request: updated })
  } catch (err) {
    return errorResponse(err)
  }
}
