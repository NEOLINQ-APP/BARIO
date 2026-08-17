import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { runAutomations } from '@/lib/barioOneAutomations'
import { triggerWebhooks } from '@/lib/barioOneWebhooks'
import { parseCsv } from '@/lib/csv'
import { errorResponse } from '@/lib/errors'

// Maps the header text (case-insensitive, matches what export/customers
// produces) to the internal field it fills. Only contactName is required;
// everything else is optional so a partial export from elsewhere in the
// real world still imports something rather than failing outright.
const HEADER_MAP: Record<string, string> = {
  'contact name': 'contactName',
  'company name': 'companyName',
  email: 'email',
  phone: 'phone',
  address: 'address',
  tags: 'tags',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const { csv } = await req.json()
    if (typeof csv !== 'string' || !csv.trim()) {
      return NextResponse.json({ error: 'csv text is required' }, { status: 400 })
    }

    const rows = parseCsv(csv)
    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV had no rows' }, { status: 400 })
    }

    const headerRow = rows[0].map((h) => h.trim().toLowerCase())
    const fieldForColumn = headerRow.map((h) => HEADER_MAP[h] ?? null)
    if (!fieldForColumn.includes('contactName') && !fieldForColumn.includes('companyName')) {
      return NextResponse.json({ error: 'CSV needs at least a "Contact Name" or "Company Name" column' }, { status: 400 })
    }

    const dataRows = rows.slice(1)
    let imported = 0
    let updated = 0
    let skipped = 0
    const errors: { row: number; reason: string }[] = []

    // Existing customers in-org, keyed by lowercased email, so a row whose
    // email matches an existing customer updates instead of duplicating.
    const existingRows = (await sql`
      SELECT id, email FROM bo_customers WHERE organization_id = ${org.id} AND email IS NOT NULL
    `) as unknown as { id: string; email: string }[]
    const existingByEmail = new Map(existingRows.map((r) => [r.email.toLowerCase(), r.id]))

    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2 // +1 for header, +1 for 1-indexing
      const cells = dataRows[i]
      const values: Record<string, string> = {}
      fieldForColumn.forEach((field, idx) => {
        if (field) values[field] = (cells[idx] ?? '').trim()
      })

      const contactName = values.contactName || values.companyName || ''
      if (!contactName) {
        skipped++
        errors.push({ row: rowNumber, reason: 'No contact name or company name' })
        continue
      }
      if (values.email && !EMAIL_RE.test(values.email)) {
        skipped++
        errors.push({ row: rowNumber, reason: `Invalid email: ${values.email}` })
        continue
      }

      const tagsJson = JSON.stringify(
        values.tags
          ? values.tags.split(';').map((t) => t.trim()).filter(Boolean)
          : []
      )

      try {
        const existingId = values.email ? existingByEmail.get(values.email.toLowerCase()) : undefined
        if (existingId) {
          // Only overwrite tags if the CSV row actually supplied a tags
          // value -- COALESCE(null, tags_json) leaves the existing tags
          // alone rather than blanking them to '[]' on every update.
          const tagsUpdateValue = values.tags ? tagsJson : null
          await sql`
            UPDATE bo_customers SET
              company_name = COALESCE(${values.companyName || null}, company_name),
              contact_name = COALESCE(${values.contactName || null}, contact_name),
              phone = COALESCE(${values.phone || null}, phone),
              address = COALESCE(${values.address || null}, address),
              tags_json = COALESCE(${tagsUpdateValue}, tags_json),
              updated_at = now()
            WHERE id = ${existingId} AND organization_id = ${org.id}
          `
          updated++
        } else {
          const id = randomUUID()
          await sql`
            INSERT INTO bo_customers (id, organization_id, company_name, contact_name, phone, email, address, tags_json, created_by_user_id)
            VALUES (${id}, ${org.id}, ${values.companyName || null}, ${contactName}, ${values.phone || null}, ${values.email || null}, ${values.address || null}, ${tagsJson}, ${user.id})
          `
          await triggerWebhooks(sql, org.id, 'customer.created', { customerId: id, contactName })
          await runAutomations(sql, org.id, 'customer.created', { customerId: id })
          imported++
        }
      } catch (rowErr: any) {
        skipped++
        errors.push({ row: rowNumber, reason: rowErr.message ?? 'Insert failed' })
      }
    }

    return NextResponse.json({ imported, updated, skipped, errors })
  } catch (err: any) {
    return errorResponse(err)
  }
}
