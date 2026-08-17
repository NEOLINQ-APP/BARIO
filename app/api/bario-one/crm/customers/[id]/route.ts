import { NextResponse } from 'next/server'
import { isRecordVisibleToMember, requireBoModule } from '@/lib/barioOne'
import { mergeCustomFieldValues } from '@/lib/barioOneCustomFields'
import type { BoCustomer, BoCustomField, BoDeal, BoTask, BoNote } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth

    const rows = (await sql`
      SELECT * FROM bo_customers WHERE id = ${params.id} AND organization_id = ${org.id}
    `) as unknown as BoCustomer[]
    const customer = rows[0]
    // Same 404 (not 403) for "doesn't exist" and "exists but not assigned
    // to you" -- an employee scoped away from a record shouldn't learn it
    // exists at all.
    if (!customer || !isRecordVisibleToMember(membership, customer.assigned_to_user_id)) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const deals = (await sql`
      SELECT * FROM bo_deals WHERE customer_id = ${customer.id} AND organization_id = ${org.id} ORDER BY created_at DESC
    `) as unknown as BoDeal[]
    const tasks = (await sql`
      SELECT * FROM bo_tasks WHERE customer_id = ${customer.id} AND organization_id = ${org.id} ORDER BY due_at ASC NULLS LAST
    `) as unknown as BoTask[]
    const notes = (await sql`
      SELECT n.*, u.email as author_email FROM bo_notes n
      LEFT JOIN users u ON u.id = n.author_user_id
      WHERE n.customer_id = ${customer.id} AND n.organization_id = ${org.id}
      ORDER BY n.created_at DESC
    `) as unknown as (BoNote & { author_email: string | null })[]

    const customFieldDefs = (await sql`
      SELECT * FROM bo_custom_fields WHERE organization_id = ${org.id} AND entity_type = 'customer' ORDER BY position ASC, created_at ASC
    `) as unknown as BoCustomField[]

    return NextResponse.json({
      customer: { ...customer, tags: JSON.parse(customer.tags_json), customFields: JSON.parse(customer.custom_fields_json) },
      deals,
      tasks,
      notes,
      customFieldDefs: customFieldDefs.map((f) => ({ ...f, options: JSON.parse(f.options_json) })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth

    const { companyName, contactName, phone, email, address, tags, customFields, assignedToUserId } = await req.json()
    const existing = (await sql`SELECT id, custom_fields_json, assigned_to_user_id FROM bo_customers WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as { id: string; custom_fields_json: string; assigned_to_user_id: string | null }[]
    if (existing.length === 0 || !isRecordVisibleToMember(membership, existing[0].assigned_to_user_id)) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const customFieldsJson = await mergeCustomFieldValues(sql, org.id, 'customer', existing[0].custom_fields_json, customFields)

    // Reassignment is owner/admin only -- an employee can't hand their own
    // leads to themselves or take someone else's. `undefined` (field not
    // sent) leaves assignment untouched; explicit `null` unassigns. Can't
    // express that with COALESCE (a SQL NULL would just fall through to
    // the old value), so resolve the final value in JS instead.
    const nextAssignedToUserId =
      membership.role !== 'employee' && assignedToUserId !== undefined
        ? assignedToUserId || null
        : existing[0].assigned_to_user_id

    await sql`
      UPDATE bo_customers SET
        company_name = ${companyName ?? null},
        contact_name = COALESCE(${contactName || null}, contact_name),
        phone = ${phone ?? null},
        email = ${email ?? null},
        address = ${address ?? null},
        tags_json = ${JSON.stringify(Array.isArray(tags) ? tags.filter((t: any) => typeof t === 'string') : [])},
        custom_fields_json = ${customFieldsJson},
        assigned_to_user_id = ${nextAssignedToUserId},
        updated_at = now()
      WHERE id = ${params.id} AND organization_id = ${org.id}
    `
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can delete customers' }, { status: 403 })
    }

    await sql`DELETE FROM bo_tasks WHERE customer_id = ${params.id} AND organization_id = ${org.id}`
    await sql`DELETE FROM bo_notes WHERE customer_id = ${params.id} AND organization_id = ${org.id}`
    await sql`DELETE FROM bo_deals WHERE customer_id = ${params.id} AND organization_id = ${org.id}`
    await sql`DELETE FROM bo_customers WHERE id = ${params.id} AND organization_id = ${org.id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
