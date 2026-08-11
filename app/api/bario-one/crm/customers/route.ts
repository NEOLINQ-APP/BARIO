import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { runAutomations } from '@/lib/barioOneAutomations'
import { mergeCustomFieldValues } from '@/lib/barioOneCustomFields'
import { triggerWebhooks } from '@/lib/barioOneWebhooks'
import type { BoCustomer } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const q = new URL(req.url).searchParams.get('q')?.trim()
    const rows = q
      ? ((await sql`
          SELECT * FROM bo_customers
          WHERE organization_id = ${org.id}
            AND (contact_name ILIKE ${'%' + q + '%'} OR company_name ILIKE ${'%' + q + '%'} OR email ILIKE ${'%' + q + '%'})
          ORDER BY created_at DESC
        `) as unknown as BoCustomer[])
      : ((await sql`SELECT * FROM bo_customers WHERE organization_id = ${org.id} ORDER BY created_at DESC`) as unknown as BoCustomer[])

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

    const { companyName, contactName, phone, email, address, notes, tags, customFields } = await req.json()
    if (typeof contactName !== 'string' || !contactName.trim()) {
      return NextResponse.json({ error: 'Contact name is required' }, { status: 400 })
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

    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
