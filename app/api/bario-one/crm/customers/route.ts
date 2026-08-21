import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { runAutomations } from '@/lib/barioOneAutomations'
import { mergeCustomFieldValues } from '@/lib/barioOneCustomFields'
import { triggerWebhooks } from '@/lib/barioOneWebhooks'
import { findDuplicateLead, recalculateLeadScore } from '@/lib/leadPipeline'
import type { BoCustomer } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth

    // Employees only see unassigned records + their own assignments;
    // owners/admins always see everything (isRecordVisibleToMember's rule,
    // applied here as a SQL predicate rather than a per-row filter so it
    // scales with the table instead of over-fetching).
    const employeeScope = membership.role === 'employee'
    const q = new URL(req.url).searchParams.get('q')?.trim()
    const rows = q
      ? ((await sql`
          SELECT * FROM bo_customers
          WHERE organization_id = ${org.id}
            AND (contact_name ILIKE ${'%' + q + '%'} OR company_name ILIKE ${'%' + q + '%'} OR email ILIKE ${'%' + q + '%'})
            AND (NOT ${employeeScope} OR assigned_to_user_id IS NULL OR assigned_to_user_id = ${membership.user_id})
          ORDER BY created_at DESC
        `) as unknown as BoCustomer[])
      : ((await sql`
          SELECT * FROM bo_customers
          WHERE organization_id = ${org.id}
            AND (NOT ${employeeScope} OR assigned_to_user_id IS NULL OR assigned_to_user_id = ${membership.user_id})
          ORDER BY created_at DESC
        `) as unknown as BoCustomer[])

    return NextResponse.json({
      customers: rows.map((c) => ({ ...c, tags: JSON.parse(c.tags_json), customFields: JSON.parse(c.custom_fields_json) })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const { companyName, contactName, phone, email, address, notes, tags, customFields, confirmDuplicate } = await req.json()
    if (typeof contactName !== 'string' || !contactName.trim()) {
      return NextResponse.json({ error: 'Contact name is required' }, { status: 400 })
    }

    // Spec: "Before creating a lead... if duplicate probability is high,
    // STOP CREATION... allow open existing / confirm new record." A caller
    // that's already seen the warning and wants to proceed anyway sets
    // confirmDuplicate:true to skip straight past this check.
    if (!confirmDuplicate) {
      const duplicate = await findDuplicateLead(sql, org.id, { email, phone, companyName, address })
      if (duplicate) {
        return NextResponse.json({ error: 'Possible duplicate', duplicate }, { status: 409 })
      }
    }

    const id = randomUUID()
    const tagsJson = JSON.stringify(Array.isArray(tags) ? tags.filter((t) => typeof t === 'string') : [])
    const customFieldsJson = await mergeCustomFieldValues(sql, org.id, 'customer', '{}', customFields)

    await sql`
      INSERT INTO bo_customers (id, organization_id, company_name, contact_name, phone, email, address, tags_json, custom_fields_json, created_by_user_id)
      VALUES (${id}, ${org.id}, ${companyName || null}, ${contactName.trim()}, ${phone || null}, ${email || null}, ${address || null}, ${tagsJson}, ${customFieldsJson}, ${user.id})
    `
    if (typeof notes === 'string' && notes.trim()) {
      await sql`
        INSERT INTO bo_notes (id, organization_id, customer_id, author_user_id, kind, body)
        VALUES (${randomUUID()}, ${org.id}, ${id}, ${user.id}, 'note', ${notes.trim()})
      `
    }

    await triggerWebhooks(sql, org.id, 'customer.created', { customerId: id, contactName: contactName.trim() })
    await runAutomations(sql, org.id, 'customer.created', { customerId: id })
    await recalculateLeadScore(sql, org.id, id)

    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
