import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoMembership } from '@/lib/barioOne'
import { mergeCustomFieldValues } from '@/lib/barioOneCustomFields'
import type { BoDeal } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

const VALID_STAGES = ['lead', 'opportunity', 'quote', 'won', 'lost']

export async function GET() {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`
      SELECT d.*, c.contact_name, c.company_name FROM bo_deals d
      JOIN bo_customers c ON c.id = d.customer_id
      WHERE d.organization_id = ${org.id}
      ORDER BY d.created_at DESC
    `) as unknown as (BoDeal & { contact_name: string; company_name: string | null })[]

    return NextResponse.json({ deals: rows.map((d) => ({ ...d, customFields: JSON.parse(d.custom_fields_json) })) })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const { customerId, title, stage, valueCents, expectedCloseDate, notes, customFields } = await req.json()
    if (typeof customerId !== 'string' || !customerId.trim()) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    const dealStage = typeof stage === 'string' && VALID_STAGES.includes(stage) ? stage : 'lead'

    const customerRows = (await sql`SELECT id FROM bo_customers WHERE id = ${customerId} AND organization_id = ${org.id}`) as unknown[]
    if (customerRows.length === 0) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const customFieldsJson = await mergeCustomFieldValues(sql, org.id, 'deal', '{}', customFields)

    const id = randomUUID()
    await sql`
      INSERT INTO bo_deals (id, organization_id, customer_id, title, stage, value_cents, expected_close_date, notes, custom_fields_json, created_by_user_id)
      VALUES (${id}, ${org.id}, ${customerId}, ${title.trim()}, ${dealStage}, ${Number.isFinite(valueCents) ? Math.round(valueCents) : 0}, ${expectedCloseDate || null}, ${notes || null}, ${customFieldsJson}, ${user.id})
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
